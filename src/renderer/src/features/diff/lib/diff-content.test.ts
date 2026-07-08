import { describe, expect, it } from "vitest";
import { areDiffContentsEqual, normalizeDiffContent } from "./diff-content";

describe("diff content helpers", () => {
  it("normalizes platform line endings for diff comparison", () => {
    expect(normalizeDiffContent("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });

  it("treats LF and CRLF versions of the same text as equal", () => {
    expect(
      areDiffContentsEqual("# title\n- item\n", "# title\r\n- item\r\n"),
    ).toBe(true);
  });
});
