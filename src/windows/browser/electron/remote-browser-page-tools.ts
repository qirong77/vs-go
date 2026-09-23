export interface PageLocator {
  selector?: string;
  nodeRef?: string;
}

export interface SnapshotOptions {
  documentId: string;
  format: "accessibility" | "dom";
  interactiveOnly: boolean;
  includeHidden: boolean;
  maxNodes: number;
  maxTextLength: number;
  selector?: string;
  maxDepth?: number;
  includeText?: boolean;
  includeRects?: boolean;
  includeAttributes?: string[];
  /** When true, only nodes intersecting the current viewport are emitted. */
  viewportOnly?: boolean;
}

export interface ParsedNodeRef {
  documentId: string;
  ordinal: number;
}

export type ElementAction =
  | "inspect"
  | "click"
  | "focus"
  | "hover"
  | "clear"
  | "setValue"
  | "insertText";

/**
 * How a click is delivered:
 * - `js` dispatches `element.click()` in the page (fast, but synthetic).
 * - `mouse` returns the element rectangle so the caller can send real input events.
 * - `auto` probes the element's center with `elementFromPoint`; when the target is
 *   actually hit-testable there it asks for real mouse input, otherwise it falls
 *   back to `element.click()`. Covered or off-screen elements therefore never get a
 *   stray mouse click at the wrong coordinates.
 */
export type ClickStrategy = "js" | "mouse" | "auto";

/**
 * Per-renderer `nodeRef` table.
 *
 * `map` holds strong references on purpose: a ref has to keep resolving to the same
 * element across API calls. That is also why every reader prunes it - a remote control
 * window can stay alive for hours, and without pruning a long-lived SPA accumulates
 * detached DOM subtrees forever. Pruning only drops elements that are no longer in the
 * document, which could not be acted on anyway.
 *
 * The reverse lookup is a `WeakMap` so element -> ref never keeps anything alive, and
 * `maxOrdinal` is tracked incrementally so readers never rescan the whole table.
 */
export interface PageNodeRegistry {
  version: number;
  map: Map<string, Element>;
  byElement: WeakMap<Element, string>;
  maxOrdinal: number;
  /** Drop entries whose element left the document. Returns how many were dropped. */
  prune(): number;
  /** Resolve a ref, pruning it on the way out when its element is gone. */
  byRef(ref: string): Element | null;
  /** Reuse the ref an element already has, or mint the next one. */
  refFor(documentId: string, element: Element): string;
}

/**
 * Installs (once per renderer) the shared nodeRef registry and returns it.
 *
 * This function is stringified into the inspected renderer, so it must stay
 * self-contained: no imports, no closures over module scope.
 */
function installPageRegistry(): PageNodeRegistry {
  const registryKey = Symbol.for("vsgo.remote-browser.nodes");
  const holder = window as unknown as Record<symbol, PageNodeRegistry | undefined>;
  const existing = holder[registryKey];
  if (existing && existing.version === 2) return existing;
  const state: PageNodeRegistry = {
    version: 2,
    map: new Map<string, Element>(),
    byElement: new WeakMap<Element, string>(),
    maxOrdinal: 0,
    prune(): number {
      let removed = 0;
      for (const [ref, element] of state.map) {
        if (!element.isConnected) {
          state.map.delete(ref);
          removed += 1;
        }
      }
      return removed;
    },
    byRef(ref: string): Element | null {
      const element = state.map.get(ref) ?? null;
      if (!element) return null;
      if (element.isConnected) return element;
      state.map.delete(ref);
      return null;
    },
    refFor(documentId: string, element: Element): string {
      const known = state.byElement.get(element);
      if (known) {
        state.map.set(known, element);
        return known;
      }
      state.maxOrdinal += 1;
      const ref = `${documentId}:n${state.maxOrdinal}`;
      state.map.set(ref, element);
      state.byElement.set(element, ref);
      return ref;
    },
  };
  Object.defineProperty(window, registryKey, {
    value: state,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return state;
}

/** Installs the page registry and runs `body` with it available as `registry`. */
function withPageRegistry(body: string): string {
  return `(() => { const registry = (${installPageRegistry.toString()})(); return ${body}; })()`;
}

export function parseNodeRef(value: string): ParsedNodeRef | null {
  const match = /^(doc_[a-zA-Z0-9_-]+):n(\d+)$/.exec(value);
  if (!match) return null;
  return { documentId: match[1], ordinal: Number(match[2]) };
}

/** This function is stringified and executed in the inspected renderer. Keep it self-contained. */
function snapshotPage(options: SnapshotOptions, registry: PageNodeRegistry): unknown {
  const normalize = (value: unknown, limit = options.maxTextLength): string =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  /**
   * Visibility for a node whose rectangle was already read by the traversal.
   *
   * `checkVisibility()` is a native primitive and avoids the `getComputedStyle` call
   * that otherwise forces a style + layout flush per node; passing the rectangle in
   * keeps the expensive layout read to one per node instead of two.
   */
  const isVisible = (element: Element, rect: DOMRect): boolean => {
    const elementWithCheck = element as Element & {
      checkVisibility?: (options?: Record<string, boolean>) => boolean;
    };
    if (typeof elementWithCheck.checkVisibility === "function") {
      // Both the legacy and the current option names are passed: unknown keys are
      // ignored, which keeps this working across Chromium versions.
      const cssVisible = elementWithCheck.checkVisibility({
        checkVisibilityCSS: true,
        checkOpacity: true,
        visibilityProperty: true,
        opacityProperty: true,
      });
      return cssVisible && rect.width > 0 && rect.height > 0;
    }
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: Math.round(window.scrollX),
    scrollY: Math.round(window.scrollY),
  };
  /** Rectangles are viewport-relative, so an intersection test is enough. */
  const isInViewport = (rect: { top: number; left: number; right: number; bottom: number }): boolean =>
    rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
  const implicitRole = (element: Element): string => {
    const tag = element.tagName.toLowerCase();
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return element.hasAttribute("multiple") ? "listbox" : "combobox";
    if (tag === "img") return "img";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "summary") return "button";
    if (tag === "table") return "table";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "search") return "searchbox";
      if (type !== "hidden") return "textbox";
    }
    return "";
  };
  const accessibleName = (element: Element, nameFromContent: boolean): string => {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return normalize(ariaLabel);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => element.ownerDocument.getElementById(id)?.textContent || "")
        .join(" ");
      if (normalize(text)) return normalize(text);
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels || []).map((label) => label.textContent || "").join(" ");
      if (normalize(labels)) return normalize(labels);
      if (element.placeholder) return normalize(element.placeholder);
    }
    const attributeName = normalize(
      element.getAttribute("alt") ||
        element.getAttribute("title") ||
        element.getAttribute("value")
    );
    if (attributeName) return attributeName;
    // Content-derived names are only meaningful for elements that act as a single
    // label, and falling back to `textContent` on a container repeats the text of its
    // whole subtree at every ancestor level - `documentElement` alone would carry the
    // entire page twice (name and text). Ancestors therefore stay nameless and the
    // text lives on the leaf that owns it.
    // A `<select>` has no content-derived name: its "text" is just the concatenation of its
    // options, which repeats what the option list already says and can run to hundreds of
    // characters. The name has to come from a label or `aria-label`.
    if (nameFromContent && !(element instanceof HTMLSelectElement)) return normalize(element.textContent);
    return "";
  };
  /**
   * Tags that render inline, i.e. whose content reads as one continuous sentence
   * together with the surrounding text rather than as a separate block.
   */
  const INLINE_TAGS = new Set([
    "a",
    "abbr",
    "b",
    "bdi",
    "bdo",
    "br",
    "cite",
    "code",
    "data",
    "dfn",
    "em",
    "font",
    "i",
    "img",
    "kbd",
    "label",
    "mark",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "time",
    "u",
    "var",
    "wbr",
    "svg",
  ]);
  /** Text the element owns directly, excluding whatever its descendants contribute. */
  const directTextOf = (element: Element): string =>
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent || "")
      .join("");
  // `snapshotPage` is serialized with `toString()` and injected into the page, so every
  // value it closes over has to be declared inside it rather than at module scope.
  const INTERACTIVE_ROLES = new Set([
    "button",
    "link",
    "textbox",
    "searchbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "option",
    "slider",
    "spinbutton",
    "switch",
    "tab",
  ]);
  const cursorCache = new Map<Element, string>();
  const cursorOf = (element: Element): string => {
    const cached = cursorCache.get(element);
    if (cached !== undefined) return cached;
    let value = "";
    try {
      value = window.getComputedStyle(element).cursor || "";
    } catch {
      value = "";
    }
    cursorCache.set(element, value);
    return value;
  };
  /**
   * Plenty of real UIs wire controls onto non-semantic elements (`<span class="alink">`,
   * `<div onclick=...>`, an icon-only `<div role=button>`-less swatch) that carry no role, so
   * role-based detection alone reports them as inert content and hides that they can be
   * activated. `cursor: pointer` is the same signal the engine uses for the hand cursor, and
   * comparing against the parent keeps the value from being inherited wholesale by a wrapper:
   * a pointer cursor on `.btn` is reported on `.btn`, not on every descendant.
   */
  const CURSOR_EXEMPT_TAGS = new Set(["html", "head", "body", "script", "style", "link", "meta", "title", "noscript"]);
  const looksClickable = (element: Element): boolean => {
    if (element.getAttribute("onclick") !== null) return true;
    if (typeof (element as HTMLElement).onclick === "function") return true;
    if (CURSOR_EXEMPT_TAGS.has(element.tagName.toLowerCase())) return false;
    if (cursorOf(element) !== "pointer") return false;
    const parent = element.parentElement;
    return !parent || cursorOf(parent) !== "pointer";
  };
  const booleanAttribute = (element: Element, name: string): boolean | undefined => {
    const aria = element.getAttribute(`aria-${name}`);
    if (aria === "true") return true;
    if (aria === "false") return false;
    if (name in element) return Boolean((element as unknown as Record<string, unknown>)[name]);
    return undefined;
  };
  /**
   * Whether a select renders its options as elements of their own, in which case listing the
   * options on the select as well would state the same choices twice. A closed select lays its
   * options out at zero size; an open or `multiple` one lays them out for real.
   */
  const areOptionsRendered = (element: HTMLSelectElement): boolean => {
    const first = element.options[0];
    if (!first) return false;
    const rect = first.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isInteractive = (element: Element, role: string): boolean => {
    if (INTERACTIVE_ROLES.has(role)) return true;
    const tag = element.tagName.toLowerCase();
    return ["button", "input", "select", "textarea", "summary"].includes(tag) || element.hasAttribute("onclick");
  };

  type QueueItem = {
    element: Element;
    depth: number;
    parentNodeRef: string | null;
    framePath: string;
    inShadowRoot: boolean;
  };
  let root: Element | null = document.documentElement;
  if (options.selector) root = document.querySelector(options.selector);
  if (!root) {
    return {
      ok: false,
      reason: options.selector ? "snapshot root not found" : "document root not found",
      selector: options.selector,
      documentId: options.documentId,
      format: options.format,
      nodes: [],
      truncated: false,
    };
  }
  const queue: QueueItem[] = [
    { element: root, depth: 0, parentNodeRef: null, framePath: "main", inShadowRoot: false },
  ];
  const nodes: Array<Record<string, unknown>> = [];
  let interactiveCount = 0;
  let offscreenCount = 0;
  // Refs stay valid only while their element is in the document, so the table is
  // reaped on every read instead of growing for the lifetime of the renderer.
  const prunedRefs = registry.prune();
  let visited = 0;
  let truncated = false;

  // A cursor instead of `shift()`: a wide sibling list would otherwise turn the
  // traversal into an O(n^2) walk from repeatedly re-indexing the array.
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor];
    visited += 1;
    if (visited > Math.max(options.maxNodes * 20, 2_000)) {
      truncated = true;
      break;
    }
    const element = item.element;
    const rect = element.getBoundingClientRect();
    const visible = isVisible(element, rect);
    const inViewport = isInViewport(rect);
    const explicitRole = normalize(element.getAttribute("role"), 80);
    const role = explicitRole || implicitRole(element);
    const childElements = Array.from(element.children);
    const directText = directTextOf(element);
    const hasDirectText = normalize(directText).length > 0;
    const interactive =
      isInteractive(element, role) ||
      (visible && rect.width > 0 && rect.height > 0 && looksClickable(element));
    // A short all-inline subtree reads as one sentence interleaved with the element's own
    // text, so `textContent` is the faithful rendering of it. That is where inline-markup
    // instructions and status lines live: taking only the leaves would drop the sentence
    // that binds them together, and taking `textContent` on block containers would repeat
    // every descendant's content at each ancestor level.
    const inlineSentence =
      childElements.length > 0 &&
      childElements.length <= 32 &&
      childElements.every((child) => INLINE_TAGS.has(child.tagName.toLowerCase()));
    const name = accessibleName(element, childElements.length === 0 || interactive || Boolean(role));
    // Same reasoning as the name: a select's text is its option list, which is reported either
    // as the `options` summary or as the option nodes themselves.
    const textValue =
      element instanceof HTMLSelectElement
        ? ""
        : childElements.length === 0 || interactive || inlineSentence
          ? normalize(element.textContent)
          : hasDirectText
            ? normalize(directText)
            : "";
    const meaningfulAccessibilityNode =
      interactive || Boolean(role || name) || textValue.length > 0;
    const matchesFilters =
      (options.includeHidden || visible) &&
      (!options.interactiveOnly || interactive) &&
      (options.format === "dom" || meaningfulAccessibilityNode);
    const shouldInclude = matchesFilters && (!options.viewportOnly || inViewport);
    if (matchesFilters && !shouldInclude) offscreenCount += 1;

    let nearestParent = item.parentNodeRef;
    if (shouldInclude) {
      const nodeRef = registry.refFor(options.documentId, element);
      nearestParent = nodeRef;
      if (interactive) interactiveCount += 1;
      const tag = element.tagName.toLowerCase();
      const input = element instanceof HTMLInputElement ? element : null;
      const value =
        input?.type === "password"
          ? undefined
          : element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement
            ? normalize(element.value)
            : undefined;
      // Without the option list a caller can only guess what `setValue` would accept, so a
      // select reports the choices it offers. Bounded because a country picker can hold
      // hundreds of entries; `optionCount` still tells the caller the true size.
      const selectOptions =
        element instanceof HTMLSelectElement && !areOptionsRendered(element)
          ? Array.from(element.options)
              .slice(0, 20)
              .map((option) => ({ value: option.value, text: normalize(option.textContent, 60) }))
          : undefined;
      nodes.push({
        nodeRef,
        parentNodeRef: item.parentNodeRef,
        depth: item.depth,
        framePath: item.framePath,
        shadow: item.inShadowRoot || undefined,
        tag,
        role: role || undefined,
        name: name || undefined,
        text: options.includeText === false || !textValue ? undefined : textValue,
        id: element.id || undefined,
        testId: element.getAttribute("data-testid") || undefined,
        type: element.getAttribute("type") || undefined,
        value,
        options: selectOptions,
        optionCount: element instanceof HTMLSelectElement ? element.options.length : undefined,
        href: element instanceof HTMLAnchorElement ? element.href : undefined,
        visible,
        inViewport,
        interactive,
        disabled: booleanAttribute(element, "disabled"),
        checked: booleanAttribute(element, "checked"),
        selected: booleanAttribute(element, "selected"),
        expanded: booleanAttribute(element, "expanded"),
        attributes: options.includeAttributes?.length
          ? Object.fromEntries(
              options.includeAttributes.map((name) => [name, element.getAttribute(name)])
            )
          : undefined,
        rect: options.includeRects === false
          ? undefined
          : {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
      });
      if (nodes.length >= options.maxNodes) {
        truncated = cursor + 1 < queue.length;
        break;
      }
    }

    if (options.maxDepth !== undefined && item.depth >= options.maxDepth) continue;
    const children = Array.from(element.children);
    for (const child of children) {
      queue.push({
        element: child,
        depth: item.depth + 1,
        parentNodeRef: nearestParent,
        framePath: item.framePath,
        inShadowRoot: item.inShadowRoot,
      });
    }
    if (element.shadowRoot) {
      for (const child of Array.from(element.shadowRoot.children)) {
        queue.push({
          element: child,
          depth: item.depth + 1,
          parentNodeRef: nearestParent,
          framePath: item.framePath,
          inShadowRoot: true,
        });
      }
    }
    if (element instanceof HTMLIFrameElement) {
      try {
        const frameRoot = element.contentDocument?.documentElement;
        if (frameRoot) {
          queue.push({
            element: frameRoot,
            depth: item.depth + 1,
            parentNodeRef: nearestParent,
            framePath: `${item.framePath}/iframe`,
            inShadowRoot: false,
          });
        }
      } catch {
        // Cross-origin frame. Its presence remains visible as the iframe DOM node.
      }
    }
  }

  return {
    documentId: options.documentId,
    format: options.format,
    url: location.href,
    title: document.title,
    nodes,
    count: nodes.length,
    interactiveCount,
    offscreenCount,
    viewportOnly: options.viewportOnly === true,
    viewport,
    visited,
    truncated,
    staleRefs: prunedRefs,
  };
}

/** This function is stringified and executed in the inspected renderer. Keep it self-contained. */
function actOnElement(input: {
  locator: PageLocator;
  action: ElementAction;
  value?: string;
  clickStrategy?: ClickStrategy;
}, registry: PageNodeRegistry): unknown {
  let element: Element | null = null;
  if (input.locator.nodeRef) element = registry.byRef(input.locator.nodeRef);
  else if (input.locator.selector) element = document.querySelector(input.locator.selector);
  if (!element || !element.isConnected) return { ok: false, reason: "element not found" };

  // Rectangles are re-read on every call so that scrollIntoView performed by an
  // action is reflected in the coordinates handed back to the caller.
  const currentRect = (): DOMRect => element!.getBoundingClientRect();
  const isInViewport = (rect: DOMRect): boolean =>
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;
  const hitTarget = (rect: DOMRect): boolean => {
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const top = document.elementFromPoint(x, y);
    if (!top) return false;
    if (top === element || element!.contains(top)) return true;
    // Inside a shadow root elementFromPoint retargets to the host, which is an ancestor.
    return element!.getRootNode() !== document && top.contains(element!);
  };
  /**
   * Activate the element the way a pointer would: the topmost element at the target's centre.
   * That is frequently a descendant - `<li role="tab">` wrapping the `<a>` that actually
   * carries the handler, a `<span class="alink">` inside a styled `<div>` - and `element.click()`
   * fires on the target alone, so handlers delegated to those descendants never run and the
   * click silently does nothing. `hit` reports which element was activated.
   */
  const activateLikeUser = (): { hit: "self" | "descendant" | "covered" } => {
    const rect = currentRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    let top: Element | null = null;
    try {
      top = document.elementFromPoint(x, y);
    } catch {
      top = null;
    }
    if (top && top !== element && element!.contains(top)) {
      (top as HTMLElement).click?.();
      return { hit: "descendant" };
    }
    (element as HTMLElement).click?.();
    // Something else sits on top of the target; the click still goes to the target, but the
    // caller needs to know the point is intercepted.
    return { hit: top && top !== element ? "covered" : "self" };
  };
  const describe = (): Record<string, unknown> => {
    const rect = currentRect();
    return {
      ok: true,
      tag: element!.tagName,
      text: String(element!.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
      inViewport: isInViewport(rect),
      hitTarget: hitTarget(rect),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        centerX: Math.round(rect.left + rect.width / 2),
        centerY: Math.round(rect.top + rect.height / 2),
      },
    };
  };
  if (input.action === "inspect") return describe();
  if (input.action === "hover") {
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = currentRect();
    for (const type of ["mouseover", "mouseenter", "mousemove"]) {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: type !== "mouseenter",
          composed: true,
          clientX: Math.round(rect.left + rect.width / 2),
          clientY: Math.round(rect.top + rect.height / 2),
        })
      );
    }
    return describe();
  }
  if (input.action === "focus") {
    (element as HTMLElement).focus?.();
    return describe();
  }
  if (input.action === "click") {
    element.scrollIntoView({ block: "center", inline: "center" });
    const strategy = input.clickStrategy ?? "js";
    if (strategy === "mouse") return { ...describe(), strategy: "mouse" };
    if (strategy === "auto" && hitTarget(currentRect())) return { ...describe(), strategy: "mouse" };
    return { ...describe(), ...activateLikeUser(), strategy: "js" };
  }
  if (input.action === "clear" || input.action === "setValue" || input.action === "insertText") {
    const squash = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();
    // An `<option>` is what a caller naturally points at when it wants "that entry", but an
    // option holds no editable value of its own - the selection lives on the owning select.
    const isOption = element instanceof HTMLOptionElement;
    const owner = isOption ? element.closest("select") : null;
    const target = (owner ?? element) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return { ok: false, reason: "element has no value", tag: element.tagName.toLowerCase() };
    }
    target.focus?.();
    const insertion = String(input.value ?? "");
    let value = input.action === "clear"
      ? ""
      : input.action === "insertText"
        ? (() => {
            const current = target.value;
            const start = "selectionStart" in target && typeof target.selectionStart === "number"
              ? target.selectionStart
              : current.length;
            const end = "selectionEnd" in target && typeof target.selectionEnd === "number"
              ? target.selectionEnd
              : start;
            return current.slice(0, start) + insertion + current.slice(end);
          })()
        : insertion;
    // A `<select>` only accepts an option's `value`, while callers usually know the label
    // they saw in the snapshot. Resolve the label rather than failing silently, and say which
    // options exist when nothing matches - a silent no-op is indistinguishable from success.
    if (target instanceof HTMLSelectElement && input.action !== "clear") {
      const options = Array.from(target.options);
      const match =
        options.find((option) => option.value === value) ??
        options.find((option) => squash(option.textContent) === squash(value));
      if (!match) {
        return {
          ok: false,
          reason: "no option matches value",
          requested: value,
          availableOptions: options.slice(0, 50).map((option) => ({
            value: option.value,
            text: squash(option.textContent).slice(0, 60),
          })),
          optionCount: options.length,
        };
      }
      value = match.value;
    }
    const prototype =
      target instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : target instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(target, value);
    else target.value = value;
    if (input.action === "insertText" && "setSelectionRange" in target) {
      try {
        target.setSelectionRange(value.length, value.length);
      } catch {
        // Some input types do not expose a text selection.
      }
    }
    target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return {
      ...describe(),
      value: target instanceof HTMLInputElement && target.type === "password" ? undefined : target.value,
      ...(isOption ? { actedOn: "select", optionValue: value } : {}),
    };
  }
  return { ok: false, reason: "unsupported action" };
}

export function buildSnapshotScript(options: SnapshotOptions): string {
  return withPageRegistry(
    `(${snapshotPage.toString()})(${JSON.stringify(options)}, registry)`
  );
}

export function buildElementActionScript(
  locator: PageLocator,
  action: ElementAction,
  value?: string,
  clickStrategy?: ClickStrategy
): string {
  return withPageRegistry(
    `(${actOnElement.toString()})(${JSON.stringify({ locator, action, value, clickStrategy })}, registry)`
  );
}

/**
 * Counter of *trusted* input events the document has received.
 *
 * `isTrusted` is only true for events the browser itself generated, so this is the one
 * way to tell whether a synthesized (`sendInputEvent`) click actually reached the page.
 * That matters because Chromium silently drops synthesized input for a window that has
 * not painted yet - exactly the state of a freshly created hidden remote control window -
 * and the API would otherwise report a click that never happened.
 *
 * Self-contained: this is stringified into the inspected renderer.
 */
function readTrustedInputCount(): number {
  const key = Symbol.for("vsgo.remote-browser.trusted-input");
  const holder = window as unknown as Record<symbol, { count: number } | undefined>;
  let state = holder[key];
  if (!state) {
    state = { count: 0 };
    const bump = (event: Event): void => {
      if (event.isTrusted && state) state.count += 1;
    };
    document.addEventListener("mousedown", bump, true);
    document.addEventListener("keydown", bump, true);
    Object.defineProperty(window, key, {
      value: state,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }
  return state.count;
}

export function buildTrustedInputProbeScript(): string {
  return `(${readTrustedInputCount.toString()})()`;
}

export interface QueryScriptOptions {
  documentId: string;
  selector: string;
  limit: number;
  includeNodeRefs: boolean;
  attr?: string;
}

/**
 * Selector-driven element query. Shares the nodeRef table with snapshots, so a ref
 * minted here resolves in a later action and vice versa.
 */
export function buildQueryScript(options: QueryScriptOptions): string {
  return withPageRegistry(`(() => {
    const selector = ${JSON.stringify(options.selector)};
    const limit = ${jsonNumber(options.limit)};
    const attr = ${JSON.stringify(options.attr ?? null)};
    const includeNodeRefs = ${options.includeNodeRefs ? "true" : "false"};
    const documentId = ${JSON.stringify(options.documentId)};
    registry.prune();
    const elements = Array.from(document.querySelectorAll(selector)).slice(0, limit);
    return elements.map((element) => {
      const nodeRef = includeNodeRefs ? registry.refFor(documentId, element) : undefined;
      const rect = element.getBoundingClientRect();
      return {
        nodeRef,
        tag: element.tagName,
        id: element.id || '',
        className: typeof element.className === 'string' ? element.className : '',
        text: String(element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 2000),
        attr: attr ? element.getAttribute(attr) : undefined,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
  })()`);
}

function jsonNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.max(0, Math.round(value))) : "0";
}

/**
 * Render a snapshot result as compact indentation-based text for LLM prompts.
 *
 * The JSON projection repeats `tag`/`role`/`name`/`id`/`testId`/`rect`/`attributes`
 * for every node, which costs tens of thousands of tokens on real pages. The text
 * projection keeps only what an agent needs to pick a target: the nodeRef, the role,
 * the accessible name and the actionable state flags.
 */
export function formatSnapshotText(
  snapshot: Record<string, unknown>,
  options: { maxNameLength?: number; maxTextLength?: number } = {}
): string {
  /**
   * Roles that already read as controls. A node marked interactive that carries any other
   * role got there through the affordance heuristic (`cursor: pointer`), which the reader
   * cannot otherwise see, so it is worth one extra flag.
   */
  const controlRoles = new Set([
    "button",
    "link",
    "textbox",
    "searchbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "option",
    "slider",
    "spinbutton",
    "switch",
    "tab",
  ]);
  const maxNameLength = options.maxNameLength ?? 120;
  const maxTextLength = options.maxTextLength ?? 80;
  const scalar = (value: unknown, limit: number): string | undefined => {
    if (typeof value !== "string") return undefined;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return undefined;
    return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
  };
  const record = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const displayDepth = new Map<string, number>();
  const documentId = typeof snapshot.documentId === "string" ? snapshot.documentId : "";
  const url = typeof snapshot.url === "string" ? snapshot.url : "";
  const title = scalar(snapshot.title, 160);
  const viewport = record(snapshot.viewport);
  const lines: string[] = [];

  lines.push(title ? `${url} - ${title}` : url);
  lines.push(
    [
      `nodes=${nodes.length}`,
      `interactive=${typeof snapshot.interactiveCount === "number" ? snapshot.interactiveCount : 0}`,
      typeof viewport.width === "number" ? `viewport=${viewport.width}x${viewport.height}` : undefined,
      snapshot.viewportOnly === true ? "viewportOnly=true" : undefined,
      snapshot.offscreenCount ? `offscreenOmitted=${snapshot.offscreenCount}` : undefined,
      snapshot.truncated === true ? "truncated=true" : undefined,
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
  );
  if (documentId) {
    lines.push(`nodeRef format: "${documentId}:n<id>" - the [n<id>] prefixes below`);
  }

  for (const rawNode of nodes) {
    const node = record(rawNode);
    const nodeRef = typeof node.nodeRef === "string" ? node.nodeRef : "";
    const shortRef = nodeRef.startsWith(`${documentId}:`) ? nodeRef.slice(documentId.length + 1) : nodeRef;
    // Indent by the distance to the nearest *listed* ancestor rather than the real DOM depth:
    // nodes whose ancestors were filtered out are not children of whatever happens to precede
    // them, and indenting by raw depth would draw a hierarchy that does not exist.
    const parentRef = typeof node.parentNodeRef === "string" ? node.parentNodeRef : "";
    const parentDepth = parentRef ? displayDepth.get(parentRef) : undefined;
    const depth = parentDepth === undefined ? 0 : Math.min(8, parentDepth + 1);
    displayDepth.set(nodeRef, depth);
    const role = scalar(node.role, 40) ?? scalar(node.tag, 40) ?? "node";
    const name = scalar(node.name, maxNameLength);
    const parts: string[] = [];
    if (node.inViewport === false) parts.push("offscreen");
    if (node.visible === false) parts.push("hidden");
    if (node.interactive === true && !controlRoles.has(String(role).toLowerCase())) parts.push("clickable");
    if (node.disabled === true) parts.push("disabled");
    if (node.checked === true) parts.push("checked");
    if (node.selected === true) parts.push("selected");
    if (node.expanded === true) parts.push("expanded");
    const value = scalar(node.value, 60);
    if (value) parts.push(`value="${value}"`);
    if (Array.isArray(node.options) && node.options.length > 0) {
      const labels = node.options
        .map((option) => (typeof option === "object" && option !== null ? record(option) : null))
        .map((option) => scalar(option?.text, 40) ?? scalar(option?.value, 40))
        .filter((label): label is string => typeof label === "string");
      const total = typeof node.optionCount === "number" ? node.optionCount : labels.length;
      parts.push(`options=[${labels.map((label) => JSON.stringify(label)).join(", ")}${total > labels.length ? `, ...${total - labels.length} more` : ""}]`);
    }
    const text = scalar(node.text, maxTextLength);
    const showText = text !== undefined && text !== name;

    let line = `${"  ".repeat(depth)}[${shortRef}] ${role}`;
    if (name) line += ` "${name}"`;
    if (parts.length > 0) line += ` (${parts.join(", ")})`;
    if (showText) line += ` text="${text}"`;
    lines.push(line);
  }

  if (snapshot.offscreenCount && snapshot.viewportOnly === true) {
    lines.push(
      `# ${snapshot.offscreenCount} matching nodes are outside the viewport; scroll or pass viewportOnly:false to see them.`
    );
  }
  return lines.join("\n");
}
