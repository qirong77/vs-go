/** 下拉选项：value 与 Prism / Markdown 语言 id 对齐；空字符串表示自动检测 */
export const CODE_BLOCK_LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "自动" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "markdown", label: "Markdown" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "yaml", label: "YAML" },
  { value: "sql", label: "SQL" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "csharp", label: "C#" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "docker", label: "Docker" },
  { value: "graphql", label: "GraphQL" },
  { value: "xml", label: "XML" },
];

/** 用户/检测值 → Prism 已加载的 grammar 名 */
const PRISM_LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  yml: "yaml",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  md: "markdown",
  dockerfile: "docker",
  cs: "csharp",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  h: "c",
};

export function resolvePrismGrammarKey(lang: string): string {
  const raw = lang.trim().toLowerCase();
  if (!raw) return "";
  if (PRISM_LANG_ALIASES[raw]) return PRISM_LANG_ALIASES[raw];
  return raw;
}

/**
 * 无语言标记时根据内容猜测语言 id（与 CODE_BLOCK_LANGUAGE_OPTIONS / Prism 一致）。
 * 返回空字符串表示无法可靠判断（按纯文本处理）。
 */
export function detectLanguageFromContent(text: string): string {
  const t = text.trimStart().slice(0, 6000);
  if (!t) return "";

  // JSON
  if (/^\s*[\[{]/.test(t)) {
    try {
      JSON.parse(t.length > 50000 ? t.slice(0, 50000) : t);
      return "json";
    } catch {
      if (/^\s*\{[\s\S]*"[\w$-]+"\s*:/.test(t) || /^\s*\[[\s\S]*\{[\s\S]*"[\w$-]+"\s*:/.test(t)) return "json";
    }
  }

  // HTML / XML
  if (/^\s*<!DOCTYPE\s+html/i.test(t) || /^\s*<html[\s>]/i.test(t)) return "html";
  if (/^\s*<\?xml\s+version/i.test(t)) return "xml";
  if (/^\s*<[a-zA-Z][\w-]*(\s+[\w:-]+=("[^"]*"|'[^']*'))*\s*>/.test(t) && /<\/[a-zA-Z][\w-]*>/.test(t)) return "html";

  // CSS / SCSS
  if (/^\s*@(?:media|import|keyframes|charset|supports)\b/.test(t)) return "css";
  if (/^\s*[\w#.:[\]-]+\s*\{[\s\S]*:[^;]+;/.test(t) && !/[();]/.test(t.slice(0, 80))) return "css";
  if (/\$[\w-]+\s*:|@mixin\s|@include\s/.test(t)) return "scss";

  // SQL
  if (/\bSELECT\s+[\s\S]+\bFROM\b/i.test(t) && /\bWHERE\b|\bJOIN\b|\bGROUP\s+BY\b/i.test(t)) return "sql";

  // Python
  if (/^\s*(from\s+[\w.]+\s+import|import\s+[\w.]+)/m.test(t) && /\bdef\s+\w+\s*\(/.test(t)) return "python";
  if (/^\s*def\s+\w+\s*\(|^\s*class\s+\w+\s*[:(]/m.test(t) && /:\s*(\n|$)/.test(t)) return "python";
  if (/\bprint\s*\(/.test(t) && /:\s*$/.test(t.split("\n")[0] || "")) return "python";

  // Rust
  if (/\bfn\s+\w+\s*\(|let\s+mut\s+\w+|impl\s+\w+/.test(t) && /\b(String|Vec|Option|Result)\b/.test(t)) return "rust";
  if (/^\s*(use\s+[\w:]+;|mod\s+\w+)/m.test(t) && /\bfn\s+main\b/.test(t)) return "rust";

  // Go
  if (/^\s*package\s+\w+/m.test(t) && /\bfunc\s+\w+\s*\(/.test(t)) return "go";
  if (/\bfunc\s+\w+\s*\([^)]*\)\s*(\([^)]*\))?\s*\{/.test(t) && /\b:=\b/.test(t)) return "go";

  // Java / C#
  if (/^\s*public\s+class\s+\w+/m.test(t)) return "java";
  if (/^\s*(using\s+System|namespace\s+)/m.test(t) || /\bConsole\.Write(Line)?\b/.test(t)) return "csharp";

  // C / C++
  if (/#include\s*[<"]/.test(t) && /\b(int|void|char|return)\b/.test(t)) {
    if (/\bstd::|namespace\s+\w+/.test(t) || /:\s*:\s*\w+/.test(t)) return "cpp";
    return "c";
  }

  // PHP
  if (/^\s*<\?php/.test(t) || /\$\w+\s*=/.test(t) && /\bfunction\s+\w+\s*\(/.test(t)) return "php";

  // Ruby
  if (/^\s*(def\s+\w+|class\s+\w+|module\s+\w+)/m.test(t) && /\bend\b/.test(t) && /:\s*$/.test(t.split("\n")[0] || "")) return "ruby";

  // YAML
  if (/^\s*---\s*(\n|$)/.test(t) || (/^[\s-]*[\w.-]+:\s*(\S+|$)/m.test(t) && /^[\s-]*[\w.-]+:\s*$/m.test(t))) return "yaml";

  // Docker
  if (/^\s*FROM\s+[\w./:${}-]+\s*$/im.test(t) && /^\s*RUN\s+/im.test(t)) return "docker";

  // GraphQL
  if (/^\s*(query|mutation|subscription)\s+[\w_]+\b/m.test(t) && /\{[\s\S]*\}/.test(t)) return "graphql";

  // Bash
  if (/^\s*#!\/bin\/(ba)?sh\b/m.test(t) || /^\s*(export\s+\w+=|\[\[\s)/m.test(t)) return "bash";

  // TypeScript（先于 JS）
  if (/\b(interface|type)\s+\w+\s*[=<{]/.test(t) || /:\s*(string|number|boolean|void|never)\b/.test(t) && /\bas\s+\w+/.test(t))
    return "typescript";

  // TSX / JSX
  if (/<\/?[A-Z][\w]*(\s|\/|>)/.test(t) && /\breturn\s*\(/.test(t)) {
    if (/\binterface\b|\btype\s+\w+\s*=/.test(t)) return "tsx";
    return "jsx";
  }

  // JavaScript
  if (
    /\b(const|let|var)\s+\w+\s*=/.test(t) ||
    /\b(async\s+)?function\b/.test(t) ||
    /=>\s*(\{|\()/.test(t) ||
    /\bimport\s+[\w*{}\s,]+\s+from\s+['"]/.test(t) ||
    /\bexport\s+(default\s+)?(function|const|class)\b/.test(t)
  )
    return "javascript";

  // Markdown
  if (/^#{1,6}\s+\S/m.test(t) || /^\s*[-*+]\s+\S/m.test(t) || /\[.+\]\(.+\)/.test(t)) return "markdown";

  return "";
}
