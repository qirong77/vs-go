import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Ctx } from "@milkdown/ctx";
import { codeBlockAttr, codeBlockSchema } from "@milkdown/preset-commonmark";
import { $view } from "@milkdown/utils";
import type { Node as PMNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/prose/view";

import { CodeBlockLangSelect } from "./CodeBlockLangSelect";

function applyDomAttrs(el: HTMLElement, attrs: Record<string, unknown>) {
  for (const [key, val] of Object.entries(attrs)) {
    if (val == null || val === false) continue;
    if (key === "class" || key === "className") {
      el.className = String(val);
    } else if (key === "style" && typeof val === "object" && val !== null) {
      Object.assign(el.style, val as Partial<CSSStyleDeclaration>);
    } else if (typeof val === "string" || typeof val === "number") {
      el.setAttribute(key, String(val));
    }
  }
}

function stripLanguageClass(el: HTMLElement) {
  for (const c of [...el.classList]) {
    if (c.startsWith("language-")) el.classList.remove(c);
  }
}

function syncLanguageClass(code: HTMLElement, pre: HTMLElement, language: string) {
  const lang = String(language ?? "").trim();
  stripLanguageClass(pre);
  if (lang) {
    pre.setAttribute("data-language", lang);
    pre.classList.add(`language-${lang}`);
    code.className = `language-${lang}`;
  } else {
    pre.removeAttribute("data-language");
    code.removeAttribute("class");
  }
}

/**
 * 代码块自定义视图：折叠按钮、右上角 Ant Design 语言选择；勿在 pre 上写会触发 PM 重同步的 style。
 */
export const codeBlockCollapseView = $view(codeBlockSchema.node, (ctx: Ctx) => {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    const getAttrs = (n: PMNode) =>
      ctx.get(codeBlockAttr.key)(n) as { pre?: Record<string, unknown>; code?: Record<string, unknown> };
    const domAttrs = getAttrs(node);
    const language = String(node.attrs.language ?? "");

    const shell = document.createElement("div");
    shell.className = "milkdown-code-block-shell";

    const langMount = document.createElement("div");
    langMount.className = "code-block-lang-select-mount";

    let langRoot: Root | null = null;

    function dispatchLanguage(next: string) {
      const pos = getPos();
      if (pos === undefined) return;
      const { state } = view;
      const tr = state.tr.setNodeAttribute(pos, "language", next);
      view.dispatch(tr);
    }

    const renderLangSelect = (lang: string) => {
      if (!langRoot) langRoot = createRoot(langMount);
      langRoot.render(
        createElement(CodeBlockLangSelect, {
          value: lang,
          onChange: dispatchLanguage,
          getPopupContainer: (trigger: HTMLElement) =>
            (trigger.closest(".milkdown-code-block-shell") as HTMLElement | null) ?? document.body,
        })
      );
    };

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "code-block-collapse-toggle";
    toggle.setAttribute("aria-label", "折叠或展开代码块");
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "▼";
    toggle.contentEditable = "false";

    const pre = document.createElement("pre");
    applyDomAttrs(pre, domAttrs.pre ?? {});

    const code = document.createElement("code");
    applyDomAttrs(code, domAttrs.code ?? {});
    syncLanguageClass(code, pre, language);

    pre.appendChild(code);
    shell.appendChild(pre);
    shell.appendChild(langMount);
    shell.appendChild(toggle);

    renderLangSelect(language);

    let collapsed = false;

    const syncCollapsed = () => {
      shell.classList.toggle("is-collapsed", collapsed);
      toggle.textContent = collapsed ? "▶" : "▼";
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };

    toggle.addEventListener(
      "mousedown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        collapsed = !collapsed;
        syncCollapsed();
      },
      true
    );

    return {
      dom: shell,
      contentDOM: code,
      stopEvent(event: Event) {
        const t = event.target;
        if (!(t instanceof globalThis.Node)) return false;
        if (code.contains(t)) return false;
        if (toggle.contains(t) || langMount.contains(t)) return true;
        if (t instanceof Element && t.closest(".ant-select-dropdown")) return true;
        return false;
      },
      ignoreMutation(mutation: ViewMutationRecord) {
        if (mutation.type === "selection") return false;
        const t = mutation.target;
        if (!(t instanceof globalThis.Node)) return false;
        return !(t === code || code.contains(t));
      },
      update(updated: PMNode) {
        if (updated.type.name !== "code_block") return false;
        const next = getAttrs(updated);
        const lang = String(updated.attrs.language ?? "");
        applyDomAttrs(pre, next.pre ?? {});
        applyDomAttrs(code, next.code ?? {});
        syncLanguageClass(code, pre, lang);
        renderLangSelect(lang);
        return true;
      },
      destroy() {
        langRoot?.unmount();
        langRoot = null;
      },
    };
  };
});
