import { describe, expect, it } from "vitest";

import { readImageFileAsDataUrl } from "./editor-image";

describe("readImageFileAsDataUrl", () => {
  it("converts pasted image files to data URLs", async () => {
    const file = new File([Uint8Array.from([1, 2, 3])], "clip.png", {
      type: "image/png",
    });

    await expect(readImageFileAsDataUrl(file)).resolves.toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("ignores non-image files", async () => {
    const file = new File(["hello"], "note.txt", {
      type: "text/plain",
    });

    await expect(readImageFileAsDataUrl(file)).resolves.toBeNull();
  });
});
