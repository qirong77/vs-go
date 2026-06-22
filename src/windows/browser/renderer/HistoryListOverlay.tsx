import { useEffect, useRef, useState } from "react";
import { HistoryOutlined, SearchOutlined } from "@ant-design/icons";
import type { BrowserHistoryItem } from "@shared/type";

// ============================================================
// History List
// ============================================================

export interface HistoryListData {
  items: BrowserHistoryItem[];
  query: string;
}

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function compactSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/[^\da-z\u00c0-\uffff]+/gi, "");
}

function parseSearchTokens(query: string): string[] {
  const tokens = normalizeSearchValue(query)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

interface HistorySearchFields {
  title: string;
  url: string;
  urlWithoutProtocol: string;
  urlWithoutWww: string;
  host: string;
  hostWithoutWww: string;
  path: string;
  decodedUrl: string;
  combined: string;
  compactCombined: string;
}

function stripProtocol(value: string): string {
  return value.replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
}

function stripWww(value: string): string {
  return value.replace(/^www\./i, "");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildHistorySearchFields(item: BrowserHistoryItem): HistorySearchFields {
  const rawTitle = item.title || "";
  const rawUrl = item.url || "";
  const urlWithoutProtocol = stripProtocol(rawUrl);
  const urlWithoutWww = stripWww(urlWithoutProtocol);
  let host = "";
  let path = "";

  try {
    const u = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
    host = u.hostname;
    path = `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const [fallbackHost, ...rest] = urlWithoutProtocol.split("/");
    host = fallbackHost || "";
    path = rest.join("/");
  }

  const hostWithoutWww = stripWww(host);
  const decodedUrl = safeDecode(rawUrl);
  const pathAsWords = path.replace(/[\-_.~/%?&=#+]+/g, " ");
  const combined = [
    rawTitle,
    rawUrl,
    urlWithoutProtocol,
    urlWithoutWww,
    decodedUrl,
    host,
    hostWithoutWww,
    path,
    pathAsWords,
  ]
    .map(normalizeSearchValue)
    .join(" ");

  return {
    title: normalizeSearchValue(rawTitle),
    url: normalizeSearchValue(rawUrl),
    urlWithoutProtocol: normalizeSearchValue(urlWithoutProtocol),
    urlWithoutWww: normalizeSearchValue(urlWithoutWww),
    host: normalizeSearchValue(host),
    hostWithoutWww: normalizeSearchValue(hostWithoutWww),
    path: normalizeSearchValue(path),
    decodedUrl: normalizeSearchValue(decodedUrl),
    combined,
    compactCombined: compactSearchValue(combined),
  };
}

function tokenMatchesFields(token: string, fields: HistorySearchFields): boolean {
  if (fields.combined.includes(token)) return true;
  const compactToken = compactSearchValue(token);
  return !!compactToken && fields.compactCombined.includes(compactToken);
}

function orderedTokenBonus(tokens: string[], fields: HistorySearchFields): number {
  if (tokens.length <= 1) return 0;
  let cursor = 0;
  for (const token of tokens) {
    const index = fields.combined.indexOf(token, cursor);
    if (index === -1) return 0;
    cursor = index + token.length;
  }
  return 35;
}

function scoreHistoryItem(
  item: BrowserHistoryItem,
  tokens: string[],
  rawQuery: string,
  fields: HistorySearchFields,
  strict: boolean
): number {
  const query = normalizeSearchValue(rawQuery);
  let score = strict ? 120 : 20;

  if (query) {
    if (fields.title === query) score += 180;
    if (fields.hostWithoutWww === query || fields.host === query) score += 170;
    if (
      fields.urlWithoutWww === query ||
      fields.urlWithoutProtocol === query ||
      fields.url === query
    ) {
      score += 150;
    }
    if (fields.title.includes(query)) score += 90;
    if (fields.hostWithoutWww.includes(query) || fields.host.includes(query)) score += 85;
    if (fields.urlWithoutWww.includes(query) || fields.urlWithoutProtocol.includes(query))
      score += 70;
    if (fields.path.includes(query)) score += 35;
  }

  for (const token of tokens) {
    if (fields.title === token) score += 80;
    else if (fields.title.startsWith(token)) score += 55;
    else if (fields.title.includes(token)) score += 42;

    if (fields.hostWithoutWww === token || fields.host === token) score += 75;
    else if (fields.hostWithoutWww.startsWith(token) || fields.host.startsWith(token)) score += 60;
    else if (fields.hostWithoutWww.includes(token) || fields.host.includes(token)) score += 48;

    if (fields.urlWithoutWww.startsWith(token) || fields.urlWithoutProtocol.startsWith(token))
      score += 42;
    else if (fields.urlWithoutWww.includes(token) || fields.urlWithoutProtocol.includes(token))
      score += 32;

    if (fields.path.includes(token)) score += 20;
    if (fields.decodedUrl.includes(token)) score += 12;

    const compactToken = compactSearchValue(token);
    if (compactToken && fields.compactCombined.includes(compactToken)) score += 10;
  }

  score += orderedTokenBonus(tokens, fields);
  score += Math.min(item.visitCount || 0, 20);
  const daysSinceVisit = Math.floor(Math.max(Date.now() - (item.lastVisit || 0), 0) / 86_400_000);
  score += Math.max(0, 14 - daysSinceVisit);
  return score;
}

function filterHistoryItems(items: BrowserHistoryItem[], query: string): BrowserHistoryItem[] {
  const tokens = parseSearchTokens(query);
  if (tokens.length === 0) return items;

  const scored = items.map((item) => {
    const fields = buildHistorySearchFields(item);
    const matchedCount = tokens.filter((token) => tokenMatchesFields(token, fields)).length;
    return {
      item,
      fields,
      matchedCount,
      strict: matchedCount === tokens.length,
    };
  });

  const strictMatches = scored.filter((entry) => entry.strict);
  const candidates =
    strictMatches.length > 0 ? strictMatches : scored.filter((entry) => entry.matchedCount > 0);

  return candidates
    .map((entry) => ({
      item: entry.item,
      score:
        scoreHistoryItem(entry.item, tokens, query, entry.fields, entry.strict) +
        entry.matchedCount * 30,
    }))
    .sort((a, b) => b.score - a.score || (b.item.lastVisit || 0) - (a.item.lastVisit || 0))
    .map((entry) => entry.item);
}

function highlightRanges(text: string, tokens: string[]): Array<{ start: number; end: number }> {
  const lowerText = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  for (const token of tokens.sort((a, b) => b.length - a.length)) {
    if (!token) continue;
    let index = lowerText.indexOf(token);
    while (index !== -1) {
      ranges.push({ start: index, end: index + token.length });
      index = lowerText.indexOf(token, index + token.length);
    }
  }

  if (ranges.length === 0) return ranges;
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }
  return merged;
}

function renderHighlightedText(text: string, query: string): React.ReactNode {
  const tokens = parseSearchTokens(query);
  if (tokens.length === 0) return text;
  const ranges = highlightRanges(text, tokens);
  if (ranges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={`${range.start}-${range.end}`} className="vsgo-history-highlight">
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

interface HistoryListOverlayProps {
  data: HistoryListData;
  onAction: (action: Record<string, unknown>) => void;
}

export default function HistoryListOverlay({
  data,
  onAction,
}: HistoryListOverlayProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(data.query);
  const items = filterHistoryItems(data.items, query);

  useEffect(() => {
    setQuery(data.query);
  }, [data.query]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  const openItem = (item: BrowserHistoryItem, mode: "current" | "new"): void => {
    onAction({ action: "select-history-item", url: item.url, mode });
  };

  const submitQuery = (mode: "current" | "new"): void => {
    const url = query.trim();
    if (!url) return;
    onAction({ action: "submit-history-address", url, mode });
  };

  return (
    <div className="vsgo-history-panel">
      <div className="vsgo-history-address-wrap">
        <SearchOutlined />
        <input
          ref={inputRef}
          className="vsgo-history-address-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitQuery(e.shiftKey ? "new" : "current");
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onAction({ action: "dismiss-overlay", refocusHost: false });
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="搜索 Google 或输入网址"
          spellCheck={false}
        />
      </div>
      <div
        className="vsgo-history-list-card"
        onMouseDown={(e) => {
          if ((e.target as Element).closest(".vsgo-history-item")) return;
          onAction({ action: "dismiss-overlay", refocusHost: false });
        }}
      >
        <div className="vsgo-history-header">
          <SearchOutlined />
          <span>{query.trim() ? "历史记录匹配项" : "历史记录"}</span>
        </div>
        {items.length === 0 ? (
          <div className="vsgo-history-empty">
            <HistoryOutlined />
            <span>{query.trim() ? "没有匹配的历史记录" : "暂无历史记录"}</span>
          </div>
        ) : (
          <div className="vsgo-history-list">
            {items.map((item) => (
              <div
                key={item.id}
                className="vsgo-history-item"
                title={`${item.title}\n${item.url}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  openItem(item, e.metaKey || e.ctrlKey ? "new" : "current");
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    openItem(item, "new");
                  }
                }}
              >
                <span className="vsgo-history-icon">
                  {item.favicon ? (
                    <img
                      src={item.favicon}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <HistoryOutlined />
                  )}
                </span>
                <div className="vsgo-history-text">
                  <div className="vsgo-history-title">
                    {renderHighlightedText(item.title || item.url, query)}
                  </div>
                  <div className="vsgo-history-url">{renderHighlightedText(item.url, query)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
