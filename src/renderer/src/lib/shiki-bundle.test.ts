import { describe, expect, it } from "vitest";

import {
  bundledLanguages,
  createHighlighter,
  getBundledShikiLanguage,
} from "./shiki-bundle";

describe("shiki bundle", () => {
  it("maps supported diff filenames to bundled languages", () => {
    expect(getBundledShikiLanguage("query.sql")).toBe("sql");
    expect(getBundledShikiLanguage("server.go")).toBe("go");
    expect(getBundledShikiLanguage("Dockerfile")).toBe("dockerfile");
  });

  it("falls back to plain text for extensions outside the bundle", () => {
    expect(getBundledShikiLanguage("document.unknown")).toBe("text");
  });

  it("loads SQL and Go grammars with the reduced highlighter", async () => {
    const highlighter = await createHighlighter({
      langs: [await bundledLanguages.sql(), await bundledLanguages.go()],
      themes: [],
    });

    expect(highlighter.getLoadedLanguages()).toEqual(
      expect.arrayContaining(["sql", "go"]),
    );
    highlighter.dispose();
  });
});
