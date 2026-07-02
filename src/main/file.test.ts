import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadImageAsDataUrl } from "./file";

vi.mock("electron", () => ({
  clipboard: {
    writeText: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  net: {
    fetch: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}));

describe("loadImageAsDataUrl", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map((root) =>
        fs.promises.rm(root, { recursive: true, force: true }),
      ),
    );
    tempRoots.length = 0;
  });

  it("loads a local image file as a data URL", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-image-"),
    );
    tempRoots.push(root);
    const imagePath = path.join(root, "demo image.png");
    await fs.promises.writeFile(imagePath, Buffer.from([1, 2, 3]));

    await expect(loadImageAsDataUrl(imagePath)).resolves.toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("loads a remote webp image as a data URL", async () => {
    const fetchImage = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "image/webp" : null,
      },
      arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer,
    }));

    await expect(
      loadImageAsDataUrl("https://static.example.com/demo.webp", {
        fetchImage,
      }),
    ).resolves.toBe("data:image/webp;base64,BAUG");
    expect(fetchImage).toHaveBeenCalledWith(
      "https://static.example.com/demo.webp",
    );
  });

  it("rejects non-image local files", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-image-"),
    );
    tempRoots.push(root);
    const textPath = path.join(root, "secret.txt");
    await fs.promises.writeFile(textPath, "secret");

    await expect(loadImageAsDataUrl(textPath)).resolves.toBeNull();
  });
});
