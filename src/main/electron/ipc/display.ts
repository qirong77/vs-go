import { ipcMain, screen, app } from "electron";
import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { VS_GO_EVENT } from "../../../common/EVENT";

const HELPER_VERSION = 6;

type HelperMode = "native" | "ddc" | "unsupported";

interface HelperDisplayInfo {
  nativeId: number;
  internal: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: HelperMode;
  brightness: number | null;
}

const C_SOURCE = String.raw`
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/graphics/IOGraphicsLib.h>
#include <IOKit/i2c/IOI2CInterface.h>
#include <IOKit/IOKitLib.h>
#include <dlfcn.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern io_service_t CGDisplayIOServicePort(CGDirectDisplayID display) __attribute__((weak_import));
typedef CFTypeRef IOAVServiceRef;
extern IOAVServiceRef IOAVServiceCreateWithService(CFAllocatorRef allocator, io_service_t service);
extern IOReturn IOAVServiceCopyEDID(IOAVServiceRef service, CFDataRef* x1);
extern IOReturn IOAVServiceReadI2C(IOAVServiceRef service, uint32_t chipAddress, uint32_t offset, void* outputBuffer, uint32_t outputBufferSize);
extern IOReturn IOAVServiceWriteI2C(IOAVServiceRef service, uint32_t chipAddress, uint32_t dataAddress, void* inputBuffer, uint32_t inputBufferSize);

typedef int (*GetBrightnessFn)(uint32_t, float *);
typedef int (*SetBrightnessFn)(uint32_t, float);
typedef CFDictionaryRef (*CoreDisplayCreateInfoDictionaryFn)(CGDirectDisplayID);

#define ARM64_DDC_7BIT_ADDRESS 0x37
#define ARM64_DDC_DATA_ADDRESS 0x51
#define ARM64_DDC_WRITE_SLEEP_US 10000
#define ARM64_DDC_READ_SLEEP_US 50000
#define ARM64_DDC_RETRY_SLEEP_US 20000
#define ARM64_DDC_WRITE_CYCLES 2
#define ARM64_DDC_RETRY_ATTEMPTS 4

static GetBrightnessFn displayServicesGetBrightness = NULL;
static SetBrightnessFn displayServicesSetBrightness = NULL;
static bool displayServicesLoaded = false;
static CoreDisplayCreateInfoDictionaryFn coreDisplayCreateInfoDictionary = NULL;
static bool coreDisplayLoaded = false;

static void loadDisplayServices(void) {
    if (displayServicesLoaded) return;
    displayServicesLoaded = true;
    void *handle = dlopen("/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices", RTLD_NOW);
    if (!handle) return;
    displayServicesGetBrightness = (GetBrightnessFn)dlsym(handle, "DisplayServicesGetBrightness");
    displayServicesSetBrightness = (SetBrightnessFn)dlsym(handle, "DisplayServicesSetBrightness");
}

static void loadCoreDisplay(void) {
    if (coreDisplayLoaded) return;
    coreDisplayLoaded = true;
    void *handle = dlopen("/System/Library/PrivateFrameworks/CoreDisplay.framework/CoreDisplay", RTLD_NOW);
    if (!handle) return;
    coreDisplayCreateInfoDictionary =
        (CoreDisplayCreateInfoDictionaryFn)dlsym(handle, "CoreDisplay_DisplayCreateInfoDictionary");
}

static bool getNativeBrightness(CGDirectDisplayID displayID, float *value) {
    loadDisplayServices();
    if (!displayServicesGetBrightness) return false;
    return displayServicesGetBrightness(displayID, value) == 0;
}

static bool setNativeBrightness(CGDirectDisplayID displayID, float value) {
    loadDisplayServices();
    if (!displayServicesSetBrightness) return false;
    if (value < 0.0f) value = 0.0f;
    if (value > 1.0f) value = 1.0f;
    return displayServicesSetBrightness(displayID, value) == 0;
}

static io_service_t findFramebuffer(CGDirectDisplayID displayID) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    if (CGDisplayIOServicePort != NULL) {
        io_service_t legacyPort = CGDisplayIOServicePort(displayID);
        if (legacyPort != MACH_PORT_NULL) return legacyPort;
    }
#pragma clang diagnostic pop

    io_iterator_t iterator = MACH_PORT_NULL;
    kern_return_t result =
        IOServiceGetMatchingServices(kIOMasterPortDefault, IOServiceMatching(IOFRAMEBUFFER_CONFORMSTO), &iterator);
    if (result != KERN_SUCCESS) return MACH_PORT_NULL;

    io_service_t service = MACH_PORT_NULL;
    io_service_t matched = MACH_PORT_NULL;

    while ((service = IOIteratorNext(iterator)) != MACH_PORT_NULL) {
        CFDictionaryRef info = IODisplayCreateInfoDictionary(service, kIODisplayOnlyPreferredName);
        if (!info) {
            IOObjectRelease(service);
            continue;
        }

        IOItemCount busCount = 0;
        IOFBGetI2CInterfaceCount(service, &busCount);
        if (busCount < 1) {
            CFRelease(info);
            IOObjectRelease(service);
            continue;
        }

        CFNumberRef vendorRef = (CFNumberRef)CFDictionaryGetValue(info, CFSTR(kDisplayVendorID));
        CFNumberRef productRef = (CFNumberRef)CFDictionaryGetValue(info, CFSTR(kDisplayProductID));
        CFNumberRef serialRef = (CFNumberRef)CFDictionaryGetValue(info, CFSTR(kDisplaySerialNumber));

        long vendor = 0;
        long product = 0;
        long serial = 0;
        if (!vendorRef || !productRef ||
            !CFNumberGetValue(vendorRef, kCFNumberLongType, &vendor) ||
            !CFNumberGetValue(productRef, kCFNumberLongType, &product)) {
            CFRelease(info);
            IOObjectRelease(service);
            continue;
        }

        if (serialRef) {
            CFNumberGetValue(serialRef, kCFNumberLongType, &serial);
        }

        bool vendorMatches = (uint32_t)vendor == CGDisplayVendorNumber(displayID);
        bool productMatches = (uint32_t)product == CGDisplayModelNumber(displayID);
        bool serialMatches =
            CGDisplaySerialNumber(displayID) == 0 || serial == 0 || (uint32_t)serial == CGDisplaySerialNumber(displayID);

        if (vendorMatches && productMatches && serialMatches) {
            matched = service;
            CFRelease(info);
            break;
        }

        CFRelease(info);
        IOObjectRelease(service);
    }

    IOObjectRelease(iterator);
    return matched;
}

static bool framebufferI2CRequest(io_service_t framebuffer, IOI2CRequest *request) {
    IOItemCount busCount = 0;
    if (IOFBGetI2CInterfaceCount(framebuffer, &busCount) != KERN_SUCCESS || busCount < 1) {
        return false;
    }

    for (IOOptionBits bus = 0; bus < busCount; bus++) {
        io_service_t interface = MACH_PORT_NULL;
        if (IOFBCopyI2CInterfaceForBus(framebuffer, bus, &interface) != KERN_SUCCESS) continue;

        IOI2CConnectRef connect = MACH_PORT_NULL;
        bool success = false;
        if (IOI2CInterfaceOpen(interface, kNilOptions, &connect) == KERN_SUCCESS) {
            success = IOI2CSendRequest(connect, kNilOptions, request) == KERN_SUCCESS && request->result == KERN_SUCCESS;
            IOI2CInterfaceClose(connect, kNilOptions);
        }
        IOObjectRelease(interface);

        if (success) return true;
    }

    return false;
}

static bool ddcReadBrightness(io_service_t framebuffer, uint16_t *currentValue, uint16_t *maxValue) {
    const int replyTypes[2] = { kIOI2CDDCciReplyTransactionType, kIOI2CSimpleTransactionType };

    for (int typeIndex = 0; typeIndex < 2; typeIndex++) {
        for (int attempt = 0; attempt < 5; attempt++) {
            IOI2CRequest request;
            unsigned char command[5] = {0};
            unsigned char reply[11] = {0};
            memset(&request, 0, sizeof(request));

            request.sendAddress = 0x6E;
            request.sendTransactionType = kIOI2CSimpleTransactionType;
            request.sendBuffer = (vm_address_t)&command[0];
            request.sendBytes = sizeof(command);
            request.minReplyDelay = 10000000;

            command[0] = 0x51;
            command[1] = 0x82;
            command[2] = 0x01;
            command[3] = 0x10;
            command[4] = request.sendAddress ^ command[0] ^ command[1] ^ command[2] ^ command[3];

            request.replyTransactionType = replyTypes[typeIndex];
            request.replyAddress = 0x6F;
            request.replySubAddress = 0x51;
            request.replyBuffer = (vm_address_t)&reply[0];
            request.replyBytes = sizeof(reply);

            if (!framebufferI2CRequest(framebuffer, &request)) {
                usleep(40000);
                continue;
            }

            unsigned char checksum = request.replyAddress ^ request.replySubAddress;
            for (int i = 1; i <= 9; i++) checksum ^= reply[i];

            if (reply[0] != request.sendAddress || reply[2] != 0x02 || reply[4] != 0x10 || reply[10] != checksum) {
                usleep(40000);
                continue;
            }

            *maxValue = (uint16_t)((reply[6] << 8) | reply[7]);
            *currentValue = (uint16_t)((reply[8] << 8) | reply[9]);
            return *maxValue > 0;
        }
    }

    return false;
}

static bool ddcWriteBrightness(io_service_t framebuffer, float normalizedValue) {
    if (normalizedValue < 0.0f) normalizedValue = 0.0f;
    if (normalizedValue > 1.0f) normalizedValue = 1.0f;

    uint16_t currentValue = 0;
    uint16_t maxValue = 100;
    if (ddcReadBrightness(framebuffer, &currentValue, &maxValue) && maxValue > 0) {
        (void)currentValue;
    } else {
        maxValue = 100;
    }

    uint16_t targetValue = (uint16_t)lroundf(normalizedValue * maxValue);

    IOI2CRequest request;
    unsigned char command[7] = {0};
    memset(&request, 0, sizeof(request));

    request.sendAddress = 0x6E;
    request.sendTransactionType = kIOI2CSimpleTransactionType;
    request.sendBuffer = (vm_address_t)&command[0];
    request.sendBytes = sizeof(command);

    command[0] = 0x51;
    command[1] = 0x84;
    command[2] = 0x03;
    command[3] = 0x10;
    command[4] = (targetValue >> 8) & 0xFF;
    command[5] = targetValue & 0xFF;
    command[6] = request.sendAddress ^ command[0] ^ command[1] ^ command[2] ^ command[3] ^ command[4] ^ command[5];

    request.replyTransactionType = kIOI2CNoTransactionType;
    request.replyBytes = 0;
    return framebufferI2CRequest(framebuffer, &request);
}

static bool edidMatchesDisplay(const UInt8 *edidBytes, CFIndex edidLength, CGDirectDisplayID displayID) {
    if (!edidBytes || edidLength < 16) return false;

    uint32_t vendor = ((uint32_t)edidBytes[8] << 8) | edidBytes[9];
    uint32_t product = ((uint32_t)edidBytes[11] << 8) | edidBytes[10];
    uint32_t serial =
        ((uint32_t)edidBytes[15] << 24) |
        ((uint32_t)edidBytes[14] << 16) |
        ((uint32_t)edidBytes[13] << 8) |
        edidBytes[12];

    bool vendorMatches = vendor == CGDisplayVendorNumber(displayID);
    bool productMatches = product == CGDisplayModelNumber(displayID);
    bool serialMatches =
        CGDisplaySerialNumber(displayID) == 0 || serial == 0 || serial == CGDisplaySerialNumber(displayID);

    return vendorMatches && productMatches && serialMatches;
}

static bool getDisplayIOLocation(CGDirectDisplayID displayID, char *buffer, size_t bufferSize) {
    if (!buffer || bufferSize == 0) return false;
    buffer[0] = '\0';

    loadCoreDisplay();
    if (!coreDisplayCreateInfoDictionary) return false;

    CFDictionaryRef info = coreDisplayCreateInfoDictionary(displayID);
    if (!info) return false;

    CFStringRef ioLocation = (CFStringRef)CFDictionaryGetValue(info, CFSTR("IODisplayLocation"));
    bool success = ioLocation && CFStringGetCString(ioLocation, buffer, bufferSize, kCFStringEncodingUTF8);
    CFRelease(info);
    return success;
}

static UInt8 ddcChecksum(UInt8 chk, const unsigned char *data, size_t start, size_t end) {
    UInt8 value = chk;
    for (size_t i = start; i <= end; i++) {
        value ^= data[i];
    }
    return value;
}

static bool avServicePerformDDCCommunication(
    IOAVServiceRef service,
    unsigned char *send,
    size_t sendLength,
    unsigned char *reply,
    size_t replyLength
) {
    if (!service || !send || sendLength == 0) return false;

    unsigned char packet[16] = {0};
    size_t packetLength = sendLength + 3;
    packet[0] = (unsigned char)(0x80 | (sendLength + 1));
    packet[1] = (unsigned char)sendLength;
    memcpy(&packet[2], send, sendLength);
    packet[packetLength - 1] = ddcChecksum(
        sendLength == 1 ? (ARM64_DDC_7BIT_ADDRESS << 1) : ((ARM64_DDC_7BIT_ADDRESS << 1) ^ ARM64_DDC_DATA_ADDRESS),
        packet,
        0,
        packetLength - 2
    );

    for (int attempt = 0; attempt <= ARM64_DDC_RETRY_ATTEMPTS; attempt++) {
        bool success = false;

        for (int cycle = 0; cycle < ARM64_DDC_WRITE_CYCLES; cycle++) {
            usleep(ARM64_DDC_WRITE_SLEEP_US);
            success = IOAVServiceWriteI2C(
                service,
                ARM64_DDC_7BIT_ADDRESS,
                ARM64_DDC_DATA_ADDRESS,
                packet,
                (uint32_t)packetLength
            ) == KERN_SUCCESS;
        }

        if (success && reply && replyLength > 0) {
            memset(reply, 0, replyLength);
            usleep(ARM64_DDC_READ_SLEEP_US);
            if (IOAVServiceReadI2C(
                    service,
                    ARM64_DDC_7BIT_ADDRESS,
                    ARM64_DDC_DATA_ADDRESS,
                    reply,
                    (uint32_t)replyLength
                ) == KERN_SUCCESS) {
                success = ddcChecksum(0x50, reply, 0, replyLength - 2) == reply[replyLength - 1];
            } else {
                success = false;
            }
        }

        if (success) return true;
        usleep(ARM64_DDC_RETRY_SLEEP_US);
    }

    return false;
}

static bool avServiceReadBrightness(IOAVServiceRef service, uint16_t *currentValue, uint16_t *maxValue) {
    if (!service || !currentValue || !maxValue) return false;

    unsigned char send[1] = {0x10};
    unsigned char reply[11] = {0};
    if (!avServicePerformDDCCommunication(service, send, sizeof(send), reply, sizeof(reply))) {
        return false;
    }

    *maxValue = (uint16_t)((reply[6] << 8) | reply[7]);
    *currentValue = (uint16_t)((reply[8] << 8) | reply[9]);
    return *maxValue > 0;
}

static bool avServiceWriteBrightnessValue(IOAVServiceRef service, uint16_t value) {
    if (!service) return false;

    unsigned char send[3] = {
        0x10,
        (unsigned char)((value >> 8) & 0xFF),
        (unsigned char)(value & 0xFF)
    };
    return avServicePerformDDCCommunication(service, send, sizeof(send), NULL, 0);
}

static io_service_t findAVServicePortByLocation(CGDirectDisplayID displayID) {
    char displayLocation[4096] = {0};
    if (!getDisplayIOLocation(displayID, displayLocation, sizeof(displayLocation))) {
        return MACH_PORT_NULL;
    }

    io_registry_entry_t root = IORegistryGetRootEntry(kIOMainPortDefault);
    if (root == MACH_PORT_NULL) return MACH_PORT_NULL;

    io_iterator_t iterator = MACH_PORT_NULL;
    kern_return_t result =
        IORegistryEntryCreateIterator(root, kIOServicePlane, kIORegistryIterateRecursively, &iterator);
    IOObjectRelease(root);
    if (result != KERN_SUCCESS) return MACH_PORT_NULL;

    io_service_t service = MACH_PORT_NULL;
    io_service_t matched = MACH_PORT_NULL;

    while ((service = IOIteratorNext(iterator)) != MACH_PORT_NULL) {
        io_string_t servicePath = {0};
        IORegistryEntryGetPath(service, kIOServicePlane, servicePath);

        if (strcmp(servicePath, displayLocation) != 0) {
            IOObjectRelease(service);
            continue;
        }

        IOObjectRelease(service);
        while ((service = IOIteratorNext(iterator)) != MACH_PORT_NULL) {
            io_name_t name = {0};
            IORegistryEntryGetName(service, name);
            if (strcmp(name, "DCPAVServiceProxy") != 0) {
                IOObjectRelease(service);
                continue;
            }

            CFTypeRef location = IORegistryEntrySearchCFProperty(
                service,
                kIOServicePlane,
                CFSTR("Location"),
                kCFAllocatorDefault,
                kIORegistryIterateRecursively
            );
            bool isExternal =
                location &&
                CFGetTypeID(location) == CFStringGetTypeID() &&
                CFStringCompare((CFStringRef)location, CFSTR("External"), 0) == kCFCompareEqualTo;
            if (location) CFRelease(location);

            if (isExternal) {
                matched = service;
                break;
            }

            IOObjectRelease(service);
        }

        break;
    }

    IOObjectRelease(iterator);
    return matched;
}

static io_service_t findAVServicePortByEDID(CGDirectDisplayID displayID) {
    io_registry_entry_t root = IORegistryGetRootEntry(kIOMainPortDefault);
    if (root == MACH_PORT_NULL) return MACH_PORT_NULL;

    io_iterator_t iterator = MACH_PORT_NULL;
    kern_return_t result =
        IORegistryEntryCreateIterator(root, kIOServicePlane, kIORegistryIterateRecursively, &iterator);
    IOObjectRelease(root);
    if (result != KERN_SUCCESS) return MACH_PORT_NULL;

    io_service_t service = MACH_PORT_NULL;
    io_service_t matched = MACH_PORT_NULL;

    while ((service = IOIteratorNext(iterator)) != MACH_PORT_NULL) {
        io_name_t name = {0};
        IORegistryEntryGetName(service, name);
        if (strcmp(name, "DCPAVServiceProxy") != 0) {
            IOObjectRelease(service);
            continue;
        }

        IOAVServiceRef avService = IOAVServiceCreateWithService(kCFAllocatorDefault, service);
        if (!avService) {
            IOObjectRelease(service);
            continue;
        }

        CFDataRef edid = NULL;
        IOReturn copyResult = IOAVServiceCopyEDID(avService, &edid);
        CFRelease(avService);

        if (copyResult != KERN_SUCCESS || !edid) {
            IOObjectRelease(service);
            continue;
        }

        const UInt8 *edidBytes = CFDataGetBytePtr(edid);
        CFIndex edidLength = CFDataGetLength(edid);
        bool isMatch = edidMatchesDisplay(edidBytes, edidLength, displayID);
        CFRelease(edid);

        if (isMatch) {
            matched = service;
            break;
        }

        IOObjectRelease(service);
    }

    IOObjectRelease(iterator);
    return matched;
}

static IOAVServiceRef createAVServiceForDisplay(CGDirectDisplayID displayID) {
    if (CGDisplayIsBuiltin(displayID)) return NULL;

    io_service_t servicePort = findAVServicePortByLocation(displayID);
    if (servicePort == MACH_PORT_NULL) {
        servicePort = findAVServicePortByEDID(displayID);
    }
    if (servicePort == MACH_PORT_NULL) {
        return NULL;
    }

    IOAVServiceRef service = IOAVServiceCreateWithService(kCFAllocatorDefault, servicePort);
    IOObjectRelease(servicePort);
    return service;
}

static bool canUseAVService(CGDirectDisplayID displayID) {
    IOAVServiceRef service = createAVServiceForDisplay(displayID);
    if (!service) return false;
    CFRelease(service);
    return true;
}

static bool avServiceWriteBrightness(CGDirectDisplayID displayID, float normalizedValue) {
    if (CGDisplayIsBuiltin(displayID)) return false;

    IOAVServiceRef service = createAVServiceForDisplay(displayID);
    if (!service) return false;

    if (normalizedValue < 0.0f) normalizedValue = 0.0f;
    if (normalizedValue > 1.0f) normalizedValue = 1.0f;

    uint16_t currentValue = 0;
    uint16_t maxValue = 100;
    if (avServiceReadBrightness(service, &currentValue, &maxValue) && maxValue > 0) {
        (void)currentValue;
    } else {
        maxValue = 100;
    }

    uint16_t targetValue = (uint16_t)lroundf(normalizedValue * maxValue);
    bool success = avServiceWriteBrightnessValue(service, targetValue);
    CFRelease(service);
    return success;
}

static void printDisplayInfo(CGDirectDisplayID displayID) {
    CGRect bounds = CGDisplayBounds(displayID);
    int internal = CGDisplayIsBuiltin(displayID) ? 1 : 0;
    int x = (int)bounds.origin.x;
    int y = (int)bounds.origin.y;
    int width = (int)bounds.size.width;
    int height = (int)bounds.size.height;

    float nativeBrightness = 0.0f;
    if (getNativeBrightness(displayID, &nativeBrightness)) {
        printf("%u|%d|%d|%d|%d|%d|native|%.6f\n", displayID, internal, x, y, width, height, nativeBrightness);
        return;
    }

    io_service_t framebuffer = findFramebuffer(displayID);
    if (framebuffer != MACH_PORT_NULL) {
        uint16_t currentValue = 0;
        uint16_t maxValue = 0;
        if (ddcReadBrightness(framebuffer, &currentValue, &maxValue) && maxValue > 0) {
            double brightness = (double)currentValue / (double)maxValue;
            printf("%u|%d|%d|%d|%d|%d|ddc|%.6f\n", displayID, internal, x, y, width, height, brightness);
        } else {
            printf("%u|%d|%d|%d|%d|%d|ddc|unknown\n", displayID, internal, x, y, width, height);
        }
        IOObjectRelease(framebuffer);
        return;
    }

    IOAVServiceRef avService = createAVServiceForDisplay(displayID);
    if (avService) {
        uint16_t currentValue = 0;
        uint16_t maxValue = 0;
        if (avServiceReadBrightness(avService, &currentValue, &maxValue) && maxValue > 0) {
            double brightness = (double)currentValue / (double)maxValue;
            printf("%u|%d|%d|%d|%d|%d|ddc|%.6f\n", displayID, internal, x, y, width, height, brightness);
        } else {
            printf("%u|%d|%d|%d|%d|%d|ddc|unknown\n", displayID, internal, x, y, width, height);
        }
        CFRelease(avService);
        return;
    }

    printf("%u|%d|%d|%d|%d|%d|unsupported|unknown\n", displayID, internal, x, y, width, height);
}

static bool setBrightness(CGDirectDisplayID displayID, float normalizedValue) {
    if (setNativeBrightness(displayID, normalizedValue)) return true;

    io_service_t framebuffer = findFramebuffer(displayID);
    if (framebuffer == MACH_PORT_NULL) {
        return avServiceWriteBrightness(displayID, normalizedValue);
    }

    bool success = ddcWriteBrightness(framebuffer, normalizedValue);
    IOObjectRelease(framebuffer);
    if (success) return true;
    return avServiceWriteBrightness(displayID, normalizedValue);
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: brightness-helper list | set <displayID> <brightness>\n");
        return 1;
    }

    if (strcmp(argv[1], "list") == 0) {
        uint32_t count = 0;
        CGGetOnlineDisplayList(0, NULL, &count);
        CGDirectDisplayID *ids = calloc(count, sizeof(CGDirectDisplayID));
        if (!ids) return 1;

        CGGetOnlineDisplayList(count, ids, &count);
        for (uint32_t i = 0; i < count; i++) {
            printDisplayInfo(ids[i]);
        }
        free(ids);
        return 0;
    }

    if (strcmp(argv[1], "set") == 0) {
        if (argc < 4) {
            fprintf(stderr, "ERROR: invalid arguments\n");
            return 1;
        }

        CGDirectDisplayID displayID = (CGDirectDisplayID)strtoul(argv[2], NULL, 10);
        float value = strtof(argv[3], NULL);
        if (setBrightness(displayID, value)) {
            printf("OK\n");
            return 0;
        }

        printf("ERROR\n");
        return 2;
    }

    fprintf(stderr, "ERROR: unknown command\n");
    return 1;
}
`;

let helperBinary: string | null = null;
let compilePromise: Promise<string> | null = null;
const electronToNativeDisplayId = new Map<number, number>();

function getHelperDir(): string {
  // Use a stable appData subdirectory so dev/prod don't compile to different helper caches.
  const dir = path.join(app.getPath("appData"), "vsgo", "native-helpers");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureHelper(): Promise<string> {
  if (helperBinary && existsSync(helperBinary)) {
    return Promise.resolve(helperBinary);
  }
  if (compilePromise) return compilePromise;

  compilePromise = new Promise<string>((resolve, reject) => {
    const dir = getHelperDir();
    const binaryName = `brightness-helper-v${HELPER_VERSION}`;
    const binaryPath = path.join(dir, binaryName);
    const sourcePath = path.join(dir, `${binaryName}.c`);
    const sourceUnchanged =
      existsSync(sourcePath) && readFileSync(sourcePath, "utf8") === C_SOURCE;

    if (existsSync(binaryPath) && sourceUnchanged) {
      helperBinary = binaryPath;
      compilePromise = null;
      resolve(binaryPath);
      return;
    }

    writeFileSync(sourcePath, C_SOURCE);

    execFile(
      "clang",
      [
        "-Wno-deprecated-declarations",
        "-o",
        binaryPath,
        sourcePath,
        "-framework",
        "ApplicationServices",
        "-framework",
        "IOKit",
        "-framework",
        "CoreFoundation",
      ],
      { timeout: 60_000 },
      (error, _stdout, stderr) => {
        compilePromise = null;
        if (error) {
          reject(new Error(`编译 brightness helper 失败: ${stderr || error.message}`));
          return;
        }

        try {
          chmodSync(binaryPath, 0o755);
        } catch {
          /* ignore */
        }
        helperBinary = binaryPath;
        resolve(binaryPath);
      },
    );
  });

  return compilePromise;
}

async function runHelper(args: string[]): Promise<string> {
  const binary = await ensureHelper();
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 5_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function parseHelperOutput(output: string): HelperDisplayInfo[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [nativeId, internal, x, y, width, height, mode, brightness] = line.split("|");
      return {
        nativeId: Number(nativeId),
        internal: internal === "1",
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
        mode: (mode as HelperMode) ?? "unsupported",
        brightness:
          brightness && brightness !== "unknown" && Number.isFinite(Number(brightness))
            ? Number(brightness)
            : null,
      };
    });
}

function matchesDisplaySize(
  display: Electron.Display,
  helperDisplay: HelperDisplayInfo,
): boolean {
  const candidates = [
    [display.size.width, display.size.height],
    [display.bounds.width, display.bounds.height],
    [
      Math.round(display.size.width * display.scaleFactor),
      Math.round(display.size.height * display.scaleFactor),
    ],
    [
      Math.round(display.bounds.width * display.scaleFactor),
      Math.round(display.bounds.height * display.scaleFactor),
    ],
  ];

  return candidates.some(
    ([width, height]) => width === helperDisplay.width && height === helperDisplay.height,
  );
}

function scoreDisplayMatch(
  display: Electron.Display,
  helperDisplay: HelperDisplayInfo,
): number {
  let score = 0;
  if (display.id === helperDisplay.nativeId) score += 1000;
  if (display.internal === helperDisplay.internal) score += 100;
  if (display.bounds.x === helperDisplay.x && display.bounds.y === helperDisplay.y) score += 80;
  if (matchesDisplaySize(display, helperDisplay)) score += 60;
  return score;
}

function mapDisplays(
  displays: Electron.Display[],
  helperDisplays: HelperDisplayInfo[],
): Map<number, HelperDisplayInfo> {
  const mapping = new Map<number, HelperDisplayInfo>();
  const remaining = new Set(helperDisplays.map((item) => item.nativeId));

  for (const display of displays) {
    let bestMatch: HelperDisplayInfo | undefined;
    let bestScore = -1;

    for (const helperDisplay of helperDisplays) {
      if (!remaining.has(helperDisplay.nativeId)) continue;
      const score = scoreDisplayMatch(display, helperDisplay);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = helperDisplay;
      }
    }

    if (bestMatch && bestScore > 0) {
      mapping.set(display.id, bestMatch);
      remaining.delete(bestMatch.nativeId);
    }
  }

  return mapping;
}

export function registerDisplayHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.DISPLAY_GET_ALL, async () => {
    const displays = screen.getAllDisplays();
    electronToNativeDisplayId.clear();

    try {
      const helperDisplays = parseHelperOutput(await runHelper(["list"]));
      const displayMapping = mapDisplays(displays, helperDisplays);

      return displays.map((display) => {
        const helperDisplay = displayMapping.get(display.id);
        if (helperDisplay) {
          electronToNativeDisplayId.set(display.id, helperDisplay.nativeId);
        }

        return {
          id: display.id,
          label: display.label || `Display ${display.id}`,
          bounds: display.bounds,
          size: display.size,
          scaleFactor: display.scaleFactor,
          rotation: display.rotation,
          internal: display.internal,
          brightness:
            helperDisplay?.brightness != null ? Math.round(helperDisplay.brightness * 100) : null,
          brightnessSupported: helperDisplay ? helperDisplay.mode !== "unsupported" : false,
        };
      });
    } catch (error) {
      console.error("获取显示器亮度信息失败:", error);
      return displays.map((display) => ({
        id: display.id,
        label: display.label || `Display ${display.id}`,
        bounds: display.bounds,
        size: display.size,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation,
        internal: display.internal,
        brightness: null,
        brightnessSupported: false,
      }));
    }
  });

  ipcMain.handle(
    VS_GO_EVENT.DISPLAY_SET_BRIGHTNESS,
    async (_event, displayId: number, brightness: number) => {
      try {
        const value = Math.max(0, Math.min(100, brightness)) / 100;
        const nativeDisplayId = electronToNativeDisplayId.get(displayId) ?? displayId;
        const result = await runHelper(["set", String(nativeDisplayId), String(value)]);
        return { success: result.startsWith("OK") };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
}
