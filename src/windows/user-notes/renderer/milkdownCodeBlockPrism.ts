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
import { flattenPrismTokens } from "./prismNormalizeTokens";

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

    let rawTokens: Array<Prism.Token | string>;
    try {
      rawTokens = Prism.tokenize(text, grammar as never);
    } catch {
      return;
    }

    const flatTokens = flattenPrismTokens(rawTokens);
    let rebuilt = "";
    for (const t of flatTokens) rebuilt += t.content;
    if (rebuilt !== text) {
      return;
    }

    const textStart = pos + 1;

    let offset = 0;
    for (const token of flatTokens) {
      const len = token.content.length;
      const styledTypes = token.types.filter((t) => t !== "plain");
      if (len > 0 && styledTypes.length > 0) {
        const cls = ["token", ...styledTypes].join(" ");
        out.push(
          Decoration.inline(textStart + offset, textStart + offset + len, {
            class: cls,
          })
        );
      }
      offset += len;
    }
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
