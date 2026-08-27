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

export function parseNodeRef(value: string): ParsedNodeRef | null {
  const match = /^(doc_[a-zA-Z0-9_-]+):n(\d+)$/.exec(value);
  if (!match) return null;
  return { documentId: match[1], ordinal: Number(match[2]) };
}

/** This function is stringified and executed in the inspected renderer. Keep it self-contained. */
function snapshotPage(options: SnapshotOptions): unknown {
  const registryKey = Symbol.for("vsgo.remote-browser.nodes");
  const existingRegistry = (
    window as unknown as Record<symbol, Map<string, Element> | undefined>
  )[registryKey];
  const registry = existingRegistry instanceof Map
    ? existingRegistry
    : new Map<string, Element>();
  if (!(existingRegistry instanceof Map)) {
    Object.defineProperty(window, registryKey, {
      value: registry,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  const normalize = (value: unknown, limit = options.maxTextLength): string =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  const isVisible = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
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
  const accessibleName = (element: Element): string => {
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
    return normalize(
      element.getAttribute("alt") ||
        element.getAttribute("title") ||
        element.getAttribute("value") ||
        element.textContent
    );
  };
  const booleanAttribute = (element: Element, name: string): boolean | undefined => {
    const aria = element.getAttribute(`aria-${name}`);
    if (aria === "true") return true;
    if (aria === "false") return false;
    if (name in element) return Boolean((element as unknown as Record<string, unknown>)[name]);
    return undefined;
  };
  const isInteractive = (element: Element, role: string): boolean => {
    if (
      [
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
      ].includes(role)
    ) {
      return true;
    }
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
  const refsByElement = new Map<Element, string>();
  let ordinal = 0;
  for (const [ref, element] of registry) {
    if (!ref.startsWith(`${options.documentId}:n`)) continue;
    const parsedOrdinal = Number(ref.slice(ref.lastIndexOf("n") + 1));
    if (Number.isSafeInteger(parsedOrdinal)) ordinal = Math.max(ordinal, parsedOrdinal);
    if (element.isConnected) refsByElement.set(element, ref);
  }
  let visited = 0;
  let truncated = false;

  while (queue.length > 0) {
    const item = queue.shift()!;
    visited += 1;
    if (visited > Math.max(options.maxNodes * 20, 2_000)) {
      truncated = true;
      break;
    }
    const element = item.element;
    const visible = isVisible(element);
    const explicitRole = normalize(element.getAttribute("role"), 80);
    const role = explicitRole || implicitRole(element);
    const name = accessibleName(element);
    const interactive = isInteractive(element, role);
    const meaningfulAccessibilityNode = interactive || Boolean(role || name);
    const shouldInclude =
      (options.includeHidden || visible) &&
      (!options.interactiveOnly || interactive) &&
      (options.format === "dom" || meaningfulAccessibilityNode);

    let nearestParent = item.parentNodeRef;
    if (shouldInclude) {
      let nodeRef = refsByElement.get(element);
      if (!nodeRef) {
        ordinal += 1;
        nodeRef = `${options.documentId}:n${ordinal}`;
        registry.set(nodeRef, element);
        refsByElement.set(element, nodeRef);
      }
      nearestParent = nodeRef;
      const rect = element.getBoundingClientRect();
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
      nodes.push({
        nodeRef,
        parentNodeRef: item.parentNodeRef,
        depth: item.depth,
        framePath: item.framePath,
        shadow: item.inShadowRoot || undefined,
        tag,
        role: role || undefined,
        name: name || undefined,
        text: options.includeText === false ? undefined : normalize(element.textContent),
        id: element.id || undefined,
        testId: element.getAttribute("data-testid") || undefined,
        type: element.getAttribute("type") || undefined,
        value,
        href: element instanceof HTMLAnchorElement ? element.href : undefined,
        visible,
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
        truncated = queue.length > 0;
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
    visited,
    truncated,
  };
}

/** This function is stringified and executed in the inspected renderer. Keep it self-contained. */
function actOnElement(input: {
  locator: PageLocator;
  action: ElementAction;
  value?: string;
}): unknown {
  const registryKey = Symbol.for("vsgo.remote-browser.nodes");
  const registry = (window as unknown as Record<symbol, Map<string, Element> | undefined>)[registryKey];
  let element: Element | null = null;
  if (input.locator.nodeRef) element = registry?.get(input.locator.nodeRef) ?? null;
  else if (input.locator.selector) element = document.querySelector(input.locator.selector);
  if (!element || !element.isConnected) return { ok: false, reason: "element not found" };

  const rect = element.getBoundingClientRect();
  const describe = (): Record<string, unknown> => ({
    ok: true,
    tag: element!.tagName,
    text: String(element!.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    rect: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      centerX: Math.round(rect.left + rect.width / 2),
      centerY: Math.round(rect.top + rect.height / 2),
    },
  });
  if (input.action === "inspect") return describe();
  if (input.action === "hover") {
    element.scrollIntoView({ block: "center", inline: "center" });
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
    (element as HTMLElement).click?.();
    return describe();
  }
  if (input.action === "clear" || input.action === "setValue" || input.action === "insertText") {
    const target = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!("value" in target)) return { ok: false, reason: "element has no value" };
    target.focus?.();
    const insertion = String(input.value ?? "");
    const value = input.action === "clear"
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
    return { ...describe(), value: target.type === "password" ? undefined : target.value };
  }
  return { ok: false, reason: "unsupported action" };
}

export function buildSnapshotScript(options: SnapshotOptions): string {
  return `(${snapshotPage.toString()})(${JSON.stringify(options)})`;
}

export function buildElementActionScript(
  locator: PageLocator,
  action: ElementAction,
  value?: string
): string {
  return `(${actOnElement.toString()})(${JSON.stringify({ locator, action, value })})`;
}
