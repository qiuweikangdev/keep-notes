import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

import {
  getCodeBlockHighlightMode,
  getSupportedCodeBlockLanguageId,
} from "./editor-code-block-languages";

const loadedLanguageExtensions = new Map<string, Promise<Extension | null>>();

/** 首屏常用语言保持同步注册，其余解析器拆成独立模块并按需加载。 */
export function getImmediateCodeBlockLanguageExtension(
  language: string,
): Extension | null {
  switch (getSupportedCodeBlockLanguageId(language)) {
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "json":
      return json();
    case "html":
      return html();
    case "css":
      return css();
    case "markdown":
      return markdown();
    case "python":
      return python();
    default:
      return null;
  }
}

export function loadCodeBlockLanguageExtension(
  language: string,
): Promise<Extension | null> {
  const normalizedLanguage = getSupportedCodeBlockLanguageId(language);
  const immediate = getImmediateCodeBlockLanguageExtension(normalizedLanguage);
  if (immediate) return Promise.resolve(immediate);
  if (getCodeBlockHighlightMode(normalizedLanguage) === "plain") {
    return Promise.resolve(null);
  }

  const pending = loadedLanguageExtensions.get(normalizedLanguage);
  if (pending) return pending;

  const loading = loadDeferredCodeBlockLanguageExtension(
    normalizedLanguage,
  ).catch(() => null);
  loadedLanguageExtensions.set(normalizedLanguage, loading);
  return loading;
}

function loadDeferredCodeBlockLanguageExtension(
  language: string,
): Promise<Extension | null> {
  switch (language) {
    case "vue":
      return import("@codemirror/lang-vue").then(({ vue }) => vue());
    case "scss":
      return import("@codemirror/lang-sass").then(({ sass }) => sass());
    case "java":
      return import("@codemirror/lang-java").then(({ java }) => java());
    case "go":
      return import("@codemirror/lang-go").then(({ go }) => go());
    case "rust":
      return import("@codemirror/lang-rust").then(({ rust }) => rust());
    case "c":
    case "cpp":
      return import("@codemirror/lang-cpp").then(({ cpp }) => cpp());
    case "sql":
      return import("@codemirror/lang-sql").then(({ sql }) => sql());
    case "yaml":
      return import("@codemirror/lang-yaml").then(({ yaml }) => yaml());
    case "xml":
      return import("@codemirror/lang-xml").then(({ xml }) => xml());
    case "bash":
      return import("@codemirror/legacy-modes/mode/shell").then(({ shell }) =>
        StreamLanguage.define(shell),
      );
    case "csharp":
      return import("@codemirror/legacy-modes/mode/clike").then(({ csharp }) =>
        StreamLanguage.define(csharp),
      );
    case "toml":
      return import("@codemirror/legacy-modes/mode/toml").then(({ toml }) =>
        StreamLanguage.define(toml),
      );
    case "dockerfile":
      return import("@codemirror/legacy-modes/mode/dockerfile").then(
        ({ dockerFile }) => StreamLanguage.define(dockerFile),
      );
    case "diff":
      return import("@codemirror/legacy-modes/mode/diff").then(({ diff }) =>
        StreamLanguage.define(diff),
      );
    default:
      return Promise.resolve(null);
  }
}
