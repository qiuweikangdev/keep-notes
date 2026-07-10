import { describe, expect, it } from "vitest";

import { shouldPrepareSplitWarmup } from "./editor-split-warmup";

describe("shouldPrepareSplitWarmup", () => {
  it("keeps one hot standby before the first large-document split", () => {
    expect(
      shouldPrepareSplitWarmup({
        documentLength: 30_000,
        visibleDocumentCopies: 1,
      }),
    ).toBe(true);
  });

  it("does not allocate a third large-document editor after splitting", () => {
    expect(
      shouldPrepareSplitWarmup({
        documentLength: 30_000,
        visibleDocumentCopies: 2,
      }),
    ).toBe(false);
  });

  it("allows standby replenishment for small documents", () => {
    expect(
      shouldPrepareSplitWarmup({
        documentLength: 2_000,
        visibleDocumentCopies: 2,
      }),
    ).toBe(true);
  });
});
