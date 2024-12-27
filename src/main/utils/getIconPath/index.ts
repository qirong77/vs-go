import { existsSync } from "fs";
// @ts-ignore
import { fileIconToBuffer } from "../../../renderer/public/lib/file-icon/index";

export const ImageMap = new Map<string, string>();
const iconBuffer = new Map<string, string>();
export const getIconBuffers = (paths = ["/Applications/BaiduNetdisk_mac.app"]) => {
    console.log(existsSync(paths[0]))
    if (!paths[0] || !existsSync(paths[0])) return "";
    if (iconBuffer.has(paths[0])) return iconBuffer.get(paths[0]);
    return fileIconToBuffer(paths, { size: 64 })
        .then((buffers) => {
            const value = (buffers[0] as any).toString("base64");
            console.log('----', paths)
            console.log(value)
            iconBuffer.set(paths[0], value);
            return value;
        })
        .catch((error) => {
            console.log(error);
        }) as Promise<string>;
};
