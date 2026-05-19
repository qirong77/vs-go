import type { Node as PMNode } from "@milkdown/prose/model";
import type { Transaction } from "@milkdown/prose/state";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";

import { detectLanguageFromContent } from "./codeBlockLanguage";

const codeBlockAutoLanguageKey = new PluginKey("vsgoCodeBlockAutoLanguage");

function appendAutoLanguage(tr: Transaction, doc: PMNode): Transaction | null {
  let out = tr;
  let changed = false;
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;
    if (String(node.attrs.language ?? "").trim()) return;
    const guessed = detectLanguageFromContent(node.textContent);
    if (!guessed) return;
    out = out.setNodeAttribute(pos, "language", guessed);
    changed = true;
  });
  return changed ? out : null;
}

/**
 * 语言为「自动」（空字符串）时，根据内容写入推断出的 language，使下拉框、data-language 与 Prism 一致。
 * 不依赖 code 上的 blur（ProseMirror 焦点在根 contenteditable，code 通常不会收到 blur）。
 */
export const codeBlockAutoLanguagePlugin = $prose(() => {
  return new Plugin({
    key: codeBlockAutoLanguageKey,
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((t) => t.docChanged)) return null;
      return appendAutoLanguage(newState.tr, newState.doc);
    },
    view(view) {
      queueMicrotask(() => {
        const next = appendAutoLanguage(view.state.tr, view.state.doc);
        if (next) view.dispatch(next);
      });
      return {};
    },
  });
});
