import { describe, expect, it } from "vitest";

import { createParseFallback } from "./editor-parse-fallback";

describe("createParseFallback", () => {
  it("keeps the document editable in source mode after a parse error", () => {
    expect(createParseFallback(new Error("Unsupported block"))).toEqual({
      mode: "source",
      message: "富文本解析失败：Unsupported block",
    });
  });

  it("normalizes unknown parse failures", () => {
    expect(createParseFallback("broken")).toEqual({
      mode: "source",
      message: "富文本解析失败：broken",
    });
  });
});
