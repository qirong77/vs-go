import { randomUUID } from "node:crypto";

const HTTP_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TAB_NOT_FOUND: 404,
  ELEMENT_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  REQUEST_NOT_FOUND: 404,
  SOURCE_MAP_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TIMEOUT: 408,
  TARGET_CLOSED: 410,
  CONFLICT: 409,
  AMBIGUOUS_TARGET: 409,
  STALE_NODE_REF: 409,
  CURSOR_EXPIRED: 410,
  EVALUATE_ERROR: 422,
  QUERY_ERROR: 422,
  READ_ERROR: 422,
  CLICK_ERROR: 422,
  HOVER_ERROR: 422,
  CAPTURE_ERROR: 502,
  BODY_TOO_LARGE: 413,
  RESPONSE_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  DEPENDENCY_FAILED: 424,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

export function httpStatusForFault(code: string): number {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

export class ApiFault extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown, status?: number) {
    super(message);
    this.name = "ApiFault";
    this.code = code;
    this.status = status ?? httpStatusForFault(code);
    this.details = details;
  }

  toJSON(): { code: string; message: string; details?: unknown } {
    const result: { code: string; message: string; details?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) result.details = this.details;
    return result;
  }
}

export function asApiFault(error: unknown): ApiFault {
  if (error instanceof ApiFault) return error;
  const message = error instanceof Error ? error.message : "Unexpected internal error";
  return new ApiFault("INTERNAL_ERROR", message);
}

function validationError(parameter: string, expected: string, actual: unknown): ApiFault {
  return new ApiFault("VALIDATION_ERROR", `Invalid parameter '${parameter}': expected ${expected}`, {
    parameter,
    expected,
    actual,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, parameter = "body"): Record<string, unknown> {
  if (!isRecord(value)) throw validationError(parameter, "an object", value);
  return value;
}

function ownValue(source: Record<string, unknown>, key: string): { present: boolean; value: unknown } {
  if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === undefined) {
    return { present: false, value: undefined };
  }
  return { present: true, value: source[key] };
}

export interface StringParameterOptions {
  required?: boolean;
  defaultValue?: string;
  allowEmpty?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

export function readStringParameter(
  source: Record<string, unknown>,
  key: string,
  options: StringParameterOptions & ({ required: true } | { defaultValue: string })
): string;
export function readStringParameter(
  source: Record<string, unknown>,
  key: string,
  options?: StringParameterOptions
): string | undefined;
export function readStringParameter(
  source: Record<string, unknown>,
  key: string,
  options: StringParameterOptions = {}
): string | undefined {
  const item = ownValue(source, key);
  if (!item.present) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    if (options.required) throw validationError(key, "a string (required)", undefined);
    return undefined;
  }
  if (typeof item.value !== "string") throw validationError(key, "a string", item.value);
  const minimum = options.minLength ?? (options.allowEmpty ? 0 : 1);
  if (item.value.length < minimum) {
    throw validationError(key, `a string with at least ${minimum} character(s)`, item.value);
  }
  if (options.maxLength !== undefined && item.value.length > options.maxLength) {
    throw validationError(key, `a string with at most ${options.maxLength} character(s)`, item.value);
  }
  if (options.pattern && !options.pattern.test(item.value)) {
    throw validationError(key, `a string matching ${options.pattern}`, item.value);
  }
  return item.value;
}

export interface IntegerParameterOptions {
  required?: boolean;
  defaultValue?: number;
  minimum?: number;
  maximum?: number;
}

export function readIntegerParameter(
  source: Record<string, unknown>,
  key: string,
  options: IntegerParameterOptions & ({ required: true } | { defaultValue: number })
): number;
export function readIntegerParameter(
  source: Record<string, unknown>,
  key: string,
  options?: IntegerParameterOptions
): number | undefined;
export function readIntegerParameter(
  source: Record<string, unknown>,
  key: string,
  options: IntegerParameterOptions = {}
): number | undefined {
  const item = ownValue(source, key);
  if (!item.present) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    if (options.required) throw validationError(key, "an integer (required)", undefined);
    return undefined;
  }
  if (typeof item.value !== "number" || !Number.isSafeInteger(item.value)) {
    throw validationError(key, "a safe integer", item.value);
  }
  if (options.minimum !== undefined && item.value < options.minimum) {
    throw validationError(key, `an integer >= ${options.minimum}`, item.value);
  }
  if (options.maximum !== undefined && item.value > options.maximum) {
    throw validationError(key, `an integer <= ${options.maximum}`, item.value);
  }
  return item.value;
}

export interface BooleanParameterOptions {
  required?: boolean;
  defaultValue?: boolean;
}

export function readBooleanParameter(
  source: Record<string, unknown>,
  key: string,
  options: BooleanParameterOptions & ({ required: true } | { defaultValue: boolean })
): boolean;
export function readBooleanParameter(
  source: Record<string, unknown>,
  key: string,
  options?: BooleanParameterOptions
): boolean | undefined;
export function readBooleanParameter(
  source: Record<string, unknown>,
  key: string,
  options: BooleanParameterOptions = {}
): boolean | undefined {
  const item = ownValue(source, key);
  if (!item.present) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    if (options.required) throw validationError(key, "a boolean (required)", undefined);
    return undefined;
  }
  if (typeof item.value !== "boolean") throw validationError(key, "a boolean", item.value);
  return item.value;
}

export interface TargetSelector {
  tabId?: string;
  windowId?: number;
  url?: string;
}

function mergeTargetField<T>(field: string, topLevel: T | undefined, nested: T | undefined): T | undefined {
  if (topLevel !== undefined && nested !== undefined && topLevel !== nested) {
    throw new ApiFault("VALIDATION_ERROR", `Conflicting target selector '${field}'`, {
      parameter: field,
      topLevel,
      target: nested,
    });
  }
  return nested ?? topLevel;
}

export function parseTargetSelector(input: unknown): TargetSelector {
  const source = requireObject(input);
  const nestedValue = ownValue(source, "target");
  const nested = nestedValue.present ? requireObject(nestedValue.value, "target") : {};

  const tabId = mergeTargetField(
    "tabId",
    readStringParameter(source, "tabId"),
    readStringParameter(nested, "tabId")
  );
  const windowId = mergeTargetField(
    "windowId",
    readIntegerParameter(source, "windowId", { minimum: 1 }),
    readIntegerParameter(nested, "windowId", { minimum: 1 })
  );
  const url = mergeTargetField(
    "url",
    readStringParameter(source, "url"),
    readStringParameter(nested, "url")
  );

  const result: TargetSelector = {};
  if (tabId !== undefined) result.tabId = tabId;
  if (windowId !== undefined) result.windowId = windowId;
  if (url !== undefined) result.url = url;
  return result;
}

export interface SafeUrlOptions {
  allowUnsafe?: boolean;
}

const ALWAYS_BLOCKED_PROTOCOLS = new Set([
  "javascript:",
  "data:",
  "file:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
]);
const DEFAULT_ALLOWED_PROTOCOLS = new Set(["http:", "https:", "vsgo:"]);

export function validateNavigationUrl(value: unknown, options: SafeUrlOptions = {}): URL {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw validationError("url", "a non-empty absolute URL without surrounding whitespace", value);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw validationError("url", "an absolute URL", value);
  }

  if (parsed.username || parsed.password) {
    throw new ApiFault("VALIDATION_ERROR", "URL credentials are not allowed", { url: value });
  }
  if (ALWAYS_BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    throw new ApiFault("VALIDATION_ERROR", `URL protocol '${parsed.protocol}' is not allowed`, {
      url: value,
      protocol: parsed.protocol,
    });
  }
  if (parsed.protocol === "about:") {
    if (parsed.href !== "about:blank") {
      throw new ApiFault("VALIDATION_ERROR", "Only about:blank is allowed", { url: value });
    }
    return parsed;
  }
  if (!options.allowUnsafe && !DEFAULT_ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ApiFault("VALIDATION_ERROR", `URL protocol '${parsed.protocol}' is not allowed`, {
      url: value,
      protocol: parsed.protocol,
      allowedProtocols: ["http:", "https:", "about:blank", "vsgo:"],
    });
  }
  return parsed;
}

export function assertSafeNavigationUrl(value: unknown, options: SafeUrlOptions = {}): string {
  return validateNavigationUrl(value, options).href;
}

export function generateRequestId(): string {
  return `req_${randomUUID()}`;
}

export interface RingEntry<T> {
  seq: number;
  value: T;
}

export interface RingReadResult<T> {
  items: RingEntry<T>[];
  cursor: number;
  oldestSeq: number | null;
  newestSeq: number | null;
  truncated: boolean;
  hasMore: boolean;
}

export class RingBuffer<T> {
  readonly capacity: number;
  private readonly storage: Array<RingEntry<T> | undefined>;
  private start = 0;
  private count = 0;
  private nextSeq: number;

  constructor(capacity: number, firstSeq = 1) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw validationError("capacity", "a positive safe integer", capacity);
    }
    if (!Number.isSafeInteger(firstSeq) || firstSeq < 1) {
      throw validationError("firstSeq", "a positive safe integer", firstSeq);
    }
    this.capacity = capacity;
    this.storage = new Array<RingEntry<T> | undefined>(capacity);
    this.nextSeq = firstSeq;
  }

  get size(): number {
    return this.count;
  }

  get oldestSeq(): number | null {
    return this.count === 0 ? null : this.entryAt(0).seq;
  }

  get newestSeq(): number | null {
    return this.count === 0 ? null : this.entryAt(this.count - 1).seq;
  }

  push(value: T): RingEntry<T> {
    if (!Number.isSafeInteger(this.nextSeq)) {
      throw new ApiFault("INTERNAL_ERROR", "Ring buffer sequence exceeded the safe integer range");
    }
    const entry = { seq: this.nextSeq, value };
    this.nextSeq += 1;
    if (this.count < this.capacity) {
      this.storage[(this.start + this.count) % this.capacity] = entry;
      this.count += 1;
    } else {
      this.storage[this.start] = entry;
      this.start = (this.start + 1) % this.capacity;
    }
    return entry;
  }

  append(value: T): RingEntry<T> {
    return this.push(value);
  }

  hasTruncated(cursor: number): boolean {
    this.validateCursor(cursor);
    const oldest = this.oldestSeq;
    return oldest !== null && cursor < oldest - 1;
  }

  readAfter(cursor?: number, limit = this.capacity): RingReadResult<T> {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw validationError("limit", "a positive safe integer", limit);
    }
    if (cursor !== undefined) this.validateCursor(cursor);

    const oldest = this.oldestSeq;
    const newest = this.newestSeq;
    if (oldest === null || newest === null) {
      return {
        items: [],
        cursor: cursor ?? this.nextSeq - 1,
        oldestSeq: null,
        newestSeq: null,
        truncated: false,
        hasMore: false,
      };
    }

    if (cursor !== undefined && cursor > newest) {
      throw validationError("cursor", `an integer <= newest sequence ${newest}`, cursor);
    }
    const truncated = cursor !== undefined && cursor < oldest - 1;
    const firstWantedSeq = cursor === undefined || truncated ? oldest : cursor + 1;
    const items: RingEntry<T>[] = [];
    for (let index = 0; index < this.count && items.length < limit; index += 1) {
      const entry = this.entryAt(index);
      if (entry.seq >= firstWantedSeq) items.push(entry);
    }
    const resultCursor = items.length > 0 ? items[items.length - 1].seq : (cursor ?? newest);
    return {
      items,
      cursor: resultCursor,
      oldestSeq: oldest,
      newestSeq: newest,
      truncated,
      hasMore: resultCursor < newest,
    };
  }

  snapshot(limit = this.capacity): RingReadResult<T> {
    return this.readAfter(undefined, limit);
  }

  clear(): void {
    this.storage.fill(undefined);
    this.start = 0;
    this.count = 0;
  }

  private entryAt(offset: number): RingEntry<T> {
    const entry = this.storage[(this.start + offset) % this.capacity];
    if (!entry) throw new ApiFault("INTERNAL_ERROR", "Ring buffer storage invariant failed");
    return entry;
  }

  private validateCursor(cursor: number): void {
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw validationError("cursor", "a non-negative safe integer", cursor);
    }
  }
}

export interface JsonSerializationOptions {
  maxBytes?: number;
  truncate?: boolean;
}

export interface SerializedJson {
  body: string;
  bytes: number;
  originalBytes: number;
  truncated: boolean;
}

export function jsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new ApiFault("INTERNAL_ERROR", "Value is not JSON serializable");
  return Buffer.byteLength(json, "utf8");
}

function stringifyJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error("Value produced no JSON output");
    return json;
  } catch (error) {
    throw new ApiFault("INTERNAL_ERROR", "Failed to serialize JSON response", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function fitPreview(json: string, maxBytes: number, originalBytes: number): string | null {
  const envelope = (preview: string): string =>
    stringifyJson({ truncated: true, originalBytes, preview });
  if (Buffer.byteLength(envelope(""), "utf8") > maxBytes) return null;

  let low = 0;
  let high = json.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = envelope(json.slice(0, middle));
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return envelope(json.slice(0, low));
}

export function serializeJsonResponse(
  value: unknown,
  options: JsonSerializationOptions = {}
): SerializedJson {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) {
    throw validationError("maxBytes", "a safe integer >= 2", maxBytes);
  }
  const json = stringifyJson(value);
  const originalBytes = Buffer.byteLength(json, "utf8");
  if (originalBytes <= maxBytes) {
    return { body: json, bytes: originalBytes, originalBytes, truncated: false };
  }
  if (!options.truncate) {
    throw new ApiFault("RESPONSE_TOO_LARGE", "JSON response exceeds the configured size limit", {
      originalBytes,
      maxBytes,
    });
  }
  const body = fitPreview(json, maxBytes, originalBytes);
  if (body === null) {
    throw new ApiFault("RESPONSE_TOO_LARGE", "Size limit is too small for a truncated JSON response", {
      originalBytes,
      maxBytes,
    });
  }
  return {
    body,
    bytes: Buffer.byteLength(body, "utf8"),
    originalBytes,
    truncated: true,
  };
}
