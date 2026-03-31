import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { Node as PMNode } from "@milkdown/prose/model";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import Prism from "prismjs";

/** 官方亮色主题（token 配色、pre/code 基础样式）；需在业务覆盖样式之前加载 */
import "prismjs/themes/prism.css";

import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-php";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-scss";

import { detectLanguageFromContent, resolvePrismGrammarKey } from "./codeBlockLanguage";

const codeBlockPrismKey = new PluginKey<DecorationSet>("vsgoCodeBlockPrism");

function collectHighlightDecorations(doc: PMNode): Decoration[] {
  const out: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;

    const text = node.textContent;
    if (!text) return;

    const attrLang = String(node.attrs.language ?? "").trim();
    const effective = attrLang || detectLanguageFromContent(text);
    const key = resolvePrismGrammarKey(effective);
    const grammar = key ? (Prism.languages as Record<string, unknown>)[key] : undefined;
    if (!grammar) return;

    let html: string;
    try {
      html = Prism.highlight(text, grammar as never, key);
    } catch {
      return;
    }

    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const textStart = pos + 1;

    const walk = (nodes: ArrayLike<ChildNode>, offset: number, inherited: string[]): number => {
      let o = offset;
      const list = Array.from(nodes);
      for (const n of list) {
        if (n.nodeType === Node.TEXT_NODE) {
          const raw = n.textContent ?? "";
          const len = raw.length;
          const cls = inherited.filter(Boolean).join(" ").trim();
          if (len > 0 && cls) {
            out.push(
              Decoration.inline(textStart + o, textStart + o + len, {
                class: cls,
              })
            );
          }
          o += len;
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          const el = n as HTMLElement;
          const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
          o = walk(el.childNodes, o, [...inherited, cls]);
        }
      }
      return o;
    };

    walk(wrap.childNodes, 0, []);
  });

  return out;
}

function buildSet(doc: PMNode): DecorationSet {
  return DecorationSet.create(doc, collectHighlightDecorations(doc));
}

export const codeBlockPrismPlugin = $prose(() => {
  return new Plugin<DecorationSet>({
    key: codeBlockPrismKey,
    state: {
      init(_, { doc }) {
        return buildSet(doc);
      },
      apply(tr, set, _oldState, newState) {
        if (!tr.docChanged) return set;
        return buildSet(newState.doc);
      },
    },
    props: {
      decorations(state) {
        return codeBlockPrismKey.getState(state);
      },
    },
  });
});
