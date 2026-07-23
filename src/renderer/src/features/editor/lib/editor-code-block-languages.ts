export interface CodeBlockLanguageOption {
  id: string;
  label: string;
  shortLabel: string;
  aliases: string[];
}

export const CODE_BLOCK_LANGUAGE_OPTIONS: CodeBlockLanguageOption[] = [
  {
    id: "text",
    label: "Plain Text",
    shortLabel: "text",
    aliases: ["txt", "plain", "plaintext"],
  },
  {
    id: "javascript",
    label: "JavaScript",
    shortLabel: "js",
    aliases: ["js", "mjs", "cjs"],
  },
  {
    id: "typescript",
    label: "TypeScript",
    shortLabel: "ts",
    aliases: ["ts"],
  },
  { id: "jsx", label: "JSX", shortLabel: "jsx", aliases: [] },
  { id: "tsx", label: "TSX", shortLabel: "tsx", aliases: [] },
  { id: "vue", label: "Vue", shortLabel: "vue", aliases: [] },
  { id: "html", label: "HTML", shortLabel: "html", aliases: ["htm"] },
  { id: "css", label: "CSS", shortLabel: "css", aliases: [] },
  { id: "scss", label: "SCSS", shortLabel: "scss", aliases: ["sass"] },
  { id: "json", label: "JSON", shortLabel: "json", aliases: ["jsonc"] },
  {
    id: "markdown",
    label: "Markdown",
    shortLabel: "md",
    aliases: ["md", "mdx"],
  },
  {
    id: "bash",
    label: "Bash",
    shortLabel: "bash",
    aliases: ["sh", "shell", "zsh"],
  },
  { id: "python", label: "Python", shortLabel: "py", aliases: ["py"] },
  { id: "java", label: "Java", shortLabel: "java", aliases: [] },
  { id: "go", label: "Go", shortLabel: "go", aliases: ["golang"] },
  { id: "rust", label: "Rust", shortLabel: "rs", aliases: ["rs"] },
  { id: "c", label: "C", shortLabel: "c", aliases: [] },
  {
    id: "cpp",
    label: "C++",
    shortLabel: "cpp",
    aliases: ["c++", "cc", "cxx"],
  },
  {
    id: "csharp",
    label: "C#",
    shortLabel: "cs",
    aliases: ["cs", "c#"],
  },
  { id: "sql", label: "SQL", shortLabel: "sql", aliases: [] },
  { id: "yaml", label: "YAML", shortLabel: "yml", aliases: ["yml"] },
  { id: "toml", label: "TOML", shortLabel: "toml", aliases: [] },
  { id: "xml", label: "XML", shortLabel: "xml", aliases: [] },
  {
    id: "dockerfile",
    label: "Dockerfile",
    shortLabel: "docker",
    aliases: ["docker"],
  },
  { id: "diff", label: "Diff", shortLabel: "diff", aliases: ["patch"] },
];

const syntaxHighlightedCodeBlockLanguages = new Set([
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "vue",
  "html",
  "css",
  "scss",
  "json",
  "markdown",
  "python",
  "xml",
]);

const normalizedLanguageEntries = CODE_BLOCK_LANGUAGE_OPTIONS.flatMap(
  (language) =>
    [language.id, language.label, language.shortLabel, ...language.aliases].map(
      (value) => ({
        key: value.toLowerCase(),
        language,
      }),
    ),
);

export function findCodeBlockLanguage(
  language: string | undefined,
): CodeBlockLanguageOption | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return CODE_BLOCK_LANGUAGE_OPTIONS[0];

  return normalizedLanguageEntries.find((entry) => entry.key === normalized)
    ?.language;
}

export function getSupportedCodeBlockLanguageId(language: string): string {
  const normalized = language.trim();
  if (!normalized) return "text";

  return findCodeBlockLanguage(normalized)?.id ?? normalized;
}

export function getCodeBlockHighlightMode(
  language: string,
): "plain" | "syntax" {
  const normalizedLanguage = getSupportedCodeBlockLanguageId(language);

  // 仅解析器实际支持的语言使用多色高亮，其余单色代码块统一采用正文常规字重。
  return syntaxHighlightedCodeBlockLanguages.has(normalizedLanguage)
    ? "syntax"
    : "plain";
}

export function getCodeBlockLanguageLabel(language: string): string {
  return findCodeBlockLanguage(language)?.label ?? language;
}

export function getCodeBlockLanguageShortLabel(language: string): string {
  return findCodeBlockLanguage(language)?.shortLabel ?? language;
}

export function searchCodeBlockLanguages(
  query: string,
): CodeBlockLanguageOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return CODE_BLOCK_LANGUAGE_OPTIONS;

  return CODE_BLOCK_LANGUAGE_OPTIONS.filter((language) =>
    [language.id, language.label, language.shortLabel, ...language.aliases]
      .map((value) => value.toLowerCase())
      .some((value) => value.includes(normalized)),
  );
}
