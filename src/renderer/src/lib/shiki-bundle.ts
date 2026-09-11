import {
  createBundledHighlighter,
  createSingletonShorthands,
  guessEmbeddedLanguages,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export * from "shiki/core";
export { createJavaScriptRegexEngine } from "shiki/engine/javascript";
export { createOnigurumaEngine } from "shiki/engine/oniguruma";

const javascript = () => import("@shikijs/langs/javascript");
const typescript = () => import("@shikijs/langs/typescript");
const bash = () => import("@shikijs/langs/bash");
const markdown = () => import("@shikijs/langs/markdown");
const scss = () => import("@shikijs/langs/scss");
const yaml = () => import("@shikijs/langs/yaml");
const dockerfile = () => import("@shikijs/langs/dockerfile");

// 差异视图与代码块共用这组常用语言，避免 Shiki 默认打包数百种语法文件。
export const bundledLanguages = {
  text: async () => ({ default: [] }),
  javascript,
  js: javascript,
  mjs: javascript,
  cjs: javascript,
  typescript,
  ts: typescript,
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  vue: () => import("@shikijs/langs/vue"),
  html: () => import("@shikijs/langs/html"),
  htm: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  scss,
  sass: scss,
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/json"),
  markdown,
  md: markdown,
  mdx: markdown,
  bash,
  sh: bash,
  shell: bash,
  zsh: bash,
  python: () => import("@shikijs/langs/python"),
  py: () => import("@shikijs/langs/python"),
  java: () => import("@shikijs/langs/java"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  rs: () => import("@shikijs/langs/rust"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  cs: () => import("@shikijs/langs/csharp"),
  sql: () => import("@shikijs/langs/sql"),
  yaml,
  yml: yaml,
  toml: () => import("@shikijs/langs/toml"),
  xml: () => import("@shikijs/langs/xml"),
  dockerfile,
  docker: dockerfile,
  diff: () => import("@shikijs/langs/diff"),
  patch: () => import("@shikijs/langs/diff"),
};

export const bundledThemes = {
  nord: () => import("@shikijs/themes/nord"),
  dracula: () => import("@shikijs/themes/dracula"),
  "solarized-dark": () => import("@shikijs/themes/solarized-dark"),
};

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: createJavaScriptRegexEngine,
});

export const {
  codeToHtml,
  codeToHast,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = createSingletonShorthands(createHighlighter, { guessEmbeddedLanguages });

const DIFF_LANGUAGE_BY_EXTENSION: Record<
  string,
  keyof typeof bundledLanguages
> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cxx: "cpp",
  diff: "diff",
  go: "go",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "jsx",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  patch: "diff",
  py: "python",
  rs: "rust",
  sass: "scss",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

export function getBundledShikiLanguage(fileName: string) {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith("dockerfile")) return "dockerfile";

  const extension = normalizedName.split(".").at(-1) ?? "";
  return DIFF_LANGUAGE_BY_EXTENSION[extension] ?? "text";
}
