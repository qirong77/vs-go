import type { Ctx } from "@milkdown/ctx";
import { codeBlockAttr, codeBlockSchema } from "@milkdown/preset-commonmark";
import { $view } from "@milkdown/utils";
import type { Node as PMNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/prose/view";

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

/**
 * 代码块自定义视图：在 pre 左侧（代码块外）显示折叠按钮，折叠时隐藏整块 pre。
 */
export const codeBlockCollapseView = $view(codeBlockSchema.node, (ctx: Ctx) => {
  return (node: PMNode, _view: EditorView, _getPos: () => number | undefined): NodeView => {
    const getAttrs = (n: PMNode) =>
      ctx.get(codeBlockAttr.key)(n) as { pre?: Record<string, unknown>; code?: Record<string, unknown> };
    const domAttrs = getAttrs(node);
    const language = String(node.attrs.language ?? "");

    const shell = document.createElement("div");
    shell.className = "milkdown-code-block-shell";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "code-block-collapse-toggle";
    toggle.setAttribute("aria-label", "折叠或展开代码块");
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "▼";
    toggle.contentEditable = "false";

    const pre = document.createElement("pre");
    applyDomAttrs(pre, domAttrs.pre ?? {});
    if (language) {
      pre.setAttribute("data-language", language);
    }

    const code = document.createElement("code");
    applyDomAttrs(code, domAttrs.code ?? {});
    if (language) {
      code.className = `language-${language}`;
    }

    pre.appendChild(code);
    // pre 先插入流式布局；按钮绝对定位叠在左上，不占宽度
    shell.appendChild(pre);
    shell.appendChild(toggle);

    let collapsed = false;

    const syncCollapsed = () => {
      // 只改 shell 的 class，勿在 pre 上写 style：否则 attributes 变更会触发 PM 重同步并还原 DOM
      shell.classList.toggle("is-collapsed", collapsed);
      toggle.textContent = collapsed ? "▶" : "▼";
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };

    // 仅用 mousedown（捕获阶段）：若同时监听 click，会与 mousedown 各触发一次导致折叠被切换两次
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
      /**
       * 必须实现：否则 ProseMirror 会在捕获/冒泡阶段处理 mousedown，吞掉按钮的 click，
       * 折叠无效；也可能干扰其它编辑交互（如斜杠菜单）。
       */
      stopEvent(event: Event) {
        const t = event.target;
        if (!(t instanceof globalThis.Node)) return false;
        return toggle.contains(t);
      },
      /**
       * 对 pre/shell/按钮 的 DOM 变更若被 PM 当成「文档脏了」会整节点重绘，折叠态立刻被冲掉。
       * 仅 contentDOM（code 内文字）的变更需要交给编辑器。
       */
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
        if (lang) {
          pre.setAttribute("data-language", lang);
          code.className = `language-${lang}`;
        } else {
          pre.removeAttribute("data-language");
          code.removeAttribute("class");
        }
        return true;
      },
    };
  };
});
