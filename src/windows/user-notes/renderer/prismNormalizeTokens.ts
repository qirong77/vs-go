/**
 * 将 Prism.tokenize 的嵌套结果展平为 { types, content }[]，且各段 content 拼接后与原文完全一致。
 *
 * 说明：prism-react-renderer 的 normalizeTokens 按「行」拆分时会把 split 掉的 \\n 丢掉，
 * SlatePad 按行对应 code-line，不拼回整段字符串，故无此问题；Milkdown 是单块 text，必须保留 \\n。
 */

import Prism from "prismjs";

type PrismToken = Prism.Token;

export type FlatPrismToken = {
  types: string[];
  content: string;
};

const appendTypes = (types: string[], add: string | string[]): string[] => {
  const typesSize = types.length;
  if (typesSize > 0 && types[typesSize - 1] === add) {
    return types;
  }
  return types.concat(add);
};

function emitStringPreservingNewlines(s: string, types: string[], out: FlatPrismToken[]) {
  const re = /\r\n|\r|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const before = s.slice(last, m.index);
    if (before) out.push({ types, content: before });
    out.push({ types: ["plain"], content: m[0] });
    last = m.index + m[0].length;
  }
  const tail = s.slice(last);
  if (tail) out.push({ types, content: tail });
}

/**
 * 递归展平 Prism.tokenize 结果；拼接所有 content 等于传入的完整 code 文本。
 */
export function flattenPrismTokens(tokens: Array<PrismToken | string>): FlatPrismToken[] {
  const out: FlatPrismToken[] = [];

  function walk(tokenArr: Array<PrismToken | string>, inherited: string[]) {
    for (const token of tokenArr) {
      if (typeof token === "string") {
        emitStringPreservingNewlines(token, ["plain"], out);
      } else {
        let types = appendTypes(inherited, token.type);
        if (token.alias) {
          types = appendTypes(types, token.alias);
        }
        const c = token.content as string | Array<PrismToken | string>;
        if (typeof c === "string") {
          emitStringPreservingNewlines(c, types, out);
        } else {
          walk(c as Array<PrismToken | string>, types);
        }
      }
    }
  }

  walk(tokens, []);
  return out;
}
