import type { WebContents } from "electron";
import {
  GREATEST_LOWER_BOUND,
  TraceMap,
  originalPositionFor,
  sourceContentFor,
  type SourceMapInput,
} from "@jridgewell/trace-mapping";

const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_ENTRIES = 32;
const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const MAX_MAP_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface LoadedSourceMap {
  map: TraceMap;
  mapUrl: string;
}

export interface GeneratedLocation {
  url: string;
  /** 1-based line. */
  line: number;
  /** 1-based column as exposed by the HTTP API. */
  column: number;
}

export interface ResolvedSourceLocation {
  generated: GeneratedLocation;
  mapUrl: string;
  source: string;
  name: string | null;
  line: number;
  /** 1-based column. */
  column: number;
  sourceContent: string | null;
  codeFrame: string | null;
}

export interface SourceMapResolverOptions {
  ttlMs?: number;
  maxEntries?: number;
}

function assertFetchableUrl(raw: string, allowData = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`invalid source URL: ${raw}`);
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed;
  if (allowData && parsed.protocol === "data:") return parsed;
  throw new Error(`source URL protocol is not allowed: ${parsed.protocol}`);
}

function decodeDataUrl(raw: string): string {
  const match = /^data:([^,]*?),(.*)$/s.exec(raw);
  if (!match) throw new Error("invalid source map data URL");
  const metadata = match[1];
  const payload = match[2];
  const decoded = /(?:^|;)base64(?:;|$)/i.test(metadata)
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
  if (Buffer.byteLength(decoded) > MAX_MAP_BYTES) {
    throw new Error(`source map exceeds ${MAX_MAP_BYTES} bytes`);
  }
  return decoded;
}

function sourceMapReference(script: string): string | null {
  // Use the last directive, matching Chromium's behavior. Both line and block forms are common.
  const expression = /(?:\/\/[#@]\s*sourceMappingURL=([^\s'"`]+)|\/\*[#@]\s*sourceMappingURL=([^*]+?)\s*\*\/)/g;
  let match: RegExpExecArray | null;
  let result: string | null = null;
  while ((match = expression.exec(script)) !== null) {
    result = (match[1] ?? match[2] ?? "").trim();
  }
  return result;
}

function makeCodeFrame(content: string, line: number, column: number, radius = 2): string {
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const width = String(end).length;
  const output: string[] = [];
  for (let current = start; current <= end; current += 1) {
    const marker = current === line ? ">" : " ";
    output.push(`${marker} ${String(current).padStart(width)} | ${lines[current - 1] ?? ""}`);
    if (current === line) {
      output.push(`  ${" ".repeat(width)} | ${" ".repeat(Math.max(0, column - 1))}^`);
    }
  }
  return output.join("\n");
}

export class SourceMapResolver {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly textCache = new Map<string, CacheEntry<string>>();
  private readonly mapCache = new Map<string, CacheEntry<LoadedSourceMap>>();
  private readonly finalUrls = new Map<string, string>();

  constructor(options: SourceMapResolverOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  clear(): void {
    this.textCache.clear();
    this.mapCache.clear();
    this.finalUrls.clear();
  }

  async resolve(
    webContents: WebContents,
    generated: GeneratedLocation
  ): Promise<ResolvedSourceLocation> {
    if (!Number.isInteger(generated.line) || generated.line < 1) {
      throw new Error("generated line must be a positive 1-based integer");
    }
    if (!Number.isInteger(generated.column) || generated.column < 1) {
      throw new Error("generated column must be a positive 1-based integer");
    }
    const loaded = await this.loadMap(webContents, generated.url);
    const original = originalPositionFor(loaded.map, {
      line: generated.line,
      column: generated.column - 1,
      bias: GREATEST_LOWER_BOUND,
    });
    if (original.source === null || original.line === null || original.column === null) {
      throw new Error("source map contains no mapping for the generated location");
    }
    const content = sourceContentFor(loaded.map, original.source);
    const oneBasedColumn = original.column + 1;
    return {
      generated,
      mapUrl: loaded.mapUrl,
      source: original.source,
      name: original.name,
      line: original.line,
      column: oneBasedColumn,
      sourceContent: content,
      codeFrame: content ? makeCodeFrame(content, original.line, oneBasedColumn) : null,
    };
  }

  private async loadMap(webContents: WebContents, scriptUrl: string): Promise<LoadedSourceMap> {
    assertFetchableUrl(scriptUrl);
    const cached = this.getCached(this.mapCache, scriptUrl);
    if (cached) return cached;

    const script = await this.fetchText(webContents, scriptUrl, MAX_SCRIPT_BYTES);
    const scriptBaseUrl = this.finalUrls.get(scriptUrl) ?? scriptUrl;
    const reference = sourceMapReference(script);
    if (!reference) throw new Error(`sourceMappingURL was not found in ${scriptUrl}`);

    let mapUrl: string;
    let rawMap: string;
    if (reference.startsWith("data:")) {
      assertFetchableUrl(reference, true);
      mapUrl = `${scriptBaseUrl}#inline-source-map`;
      rawMap = decodeDataUrl(reference);
    } else {
      mapUrl = new URL(reference, scriptBaseUrl).toString();
      assertFetchableUrl(mapUrl);
      rawMap = await this.fetchText(webContents, mapUrl, MAX_MAP_BYTES);
    }

    let input: SourceMapInput;
    try {
      input = JSON.parse(rawMap) as SourceMapInput;
    } catch (error) {
      throw new Error(`invalid source map JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const loaded = { map: new TraceMap(input, mapUrl), mapUrl };
    this.setCached(this.mapCache, scriptUrl, loaded);
    return loaded;
  }

  private async fetchText(
    webContents: WebContents,
    url: string,
    maxBytes: number
  ): Promise<string> {
    const cached = this.getCached(this.textCache, url);
    if (cached) return cached;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      let currentUrl = assertFetchableUrl(url).toString();
      let response: Response | null = null;
      for (let redirect = 0; redirect <= 5; redirect += 1) {
        let pageOrigin = "";
        try {
          pageOrigin = new URL(webContents.getURL()).origin;
        } catch {
          // An empty or transitional page has no credential-bearing origin.
        }
        response = await webContents.session.fetch(currentUrl, {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
          credentials: new URL(currentUrl).origin === pageOrigin ? "include" : "omit",
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("source redirect omitted Location header");
        currentUrl = assertFetchableUrl(new URL(location, currentUrl).toString()).toString();
        response = null;
      }
      if (!response) throw new Error("source fetch exceeded 5 redirects");
      if (!response.ok) throw new Error(`source fetch failed with HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error(`source exceeds ${maxBytes} bytes`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new Error(`source exceeds ${maxBytes} bytes`);
      const text = bytes.toString("utf8");
      this.finalUrls.delete(url);
      this.finalUrls.set(url, currentUrl);
      while (this.finalUrls.size > this.maxEntries * 2) {
        const oldest = this.finalUrls.keys().next().value as string | undefined;
        if (!oldest) break;
        this.finalUrls.delete(oldest);
      }
      this.setCached(this.textCache, url, text);
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    // Refresh insertion order to make the Map an inexpensive LRU.
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  private setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.delete(key);
    cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (cache.size > this.maxEntries) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
}

export const remoteBrowserSourceMaps = new SourceMapResolver();
