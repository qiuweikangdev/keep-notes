import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadImageAsDataUrl,
  readDirectory,
  readDirectoryShallow,
  saveImageAttachment,
} from "./file";

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

describe("readDirectory", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map((root) =>
        fs.promises.rm(root, { recursive: true, force: true }),
      ),
    );
    tempRoots.length = 0;
  });

  it("places folders first and sorts numbered names naturally", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-tree-"),
    );
    tempRoots.push(root);

    await Promise.all([
      fs.promises.mkdir(path.join(root, "10-archive")),
      fs.promises.mkdir(path.join(root, "2-projects")),
      fs.promises.writeFile(path.join(root, "10-summary.md"), ""),
      fs.promises.writeFile(path.join(root, "2-plan.md"), ""),
      fs.promises.writeFile(path.join(root, "1-intro.md"), ""),
    ]);

    const tree = await readDirectory(root);

    expect(tree?.map((node) => node.title)).toEqual([
      "2-projects",
      "10-archive",
      "1-intro.md",
      "2-plan.md",
      "10-summary.md",
    ]);
  });

  it("reads only direct children for the initial workspace tree", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-tree-"),
    );
    tempRoots.push(root);
    const docsPath = path.join(root, "docs");
    await fs.promises.mkdir(docsPath);
    await fs.promises.writeFile(path.join(docsPath, "nested.md"), "");
    await fs.promises.writeFile(path.join(root, "root.md"), "");

    const tree = await readDirectoryShallow(root);

    expect(tree).toEqual([
      {
        title: "docs",
        key: docsPath,
        children: [],
        isLoaded: false,
      },
      { title: "root.md", key: path.join(root, "root.md") },
    ]);
  });
});

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

describe("saveImageAttachment", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map((root) =>
        fs.promises.rm(root, { recursive: true, force: true }),
      ),
    );
    tempRoots.length = 0;
  });

  it("saves pasted image bytes into the workspace attachments directory", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-attachment-"),
    );
    tempRoots.push(root);
    const markdownFilePath = path.join(root, "daily.md");
    await fs.promises.writeFile(markdownFilePath, "# Daily");

    const result = await saveImageAttachment(
      {
        workspaceRootPath: root,
        markdownFilePath,
        fileName: "image.png",
        mimeType: "image/png",
        data: Uint8Array.from([1, 2, 3]).buffer,
      },
      {
        now: () => 1782999636770,
      },
    );

    expect(result.code).toBe(1);
    expect(result.data).toEqual({
      filePath: path.join(root, "attachments", "1782999636770-image.png"),
      url: "attachments/1782999636770-image.png",
    });
    await expect(
      fs.promises.readFile(
        path.join(root, "attachments", "1782999636770-image.png"),
      ),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("rejects non-image attachment payloads", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-attachment-"),
    );
    tempRoots.push(root);
    const markdownFilePath = path.join(root, "daily.md");
    await fs.promises.writeFile(markdownFilePath, "# Daily");

    const result = await saveImageAttachment(
      {
        workspaceRootPath: root,
        markdownFilePath,
        fileName: "note.txt",
        mimeType: "text/plain",
        data: Uint8Array.from([1, 2, 3]).buffer,
      },
      {
        now: () => 1782999636770,
      },
    );

    expect(result.code).toBe(0);
    await expect(
      fs.promises.stat(path.join(root, "attachments")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
