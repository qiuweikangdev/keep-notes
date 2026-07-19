import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeResult, type TreeNode } from "../shared/types";

const showMessageBox = vi.hoisted(() => vi.fn());
const trashItem = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  dialog: { showMessageBox },
  shell: { trashItem },
}));
vi.mock("./utils", () => ({
  deleteTreeNode: (treeData: TreeNode[]) => treeData,
  findNodeByKey: (treeData: TreeNode[], key: string) =>
    treeData.find((node) => node.key === key) ?? null,
  treeDataSort: async (treeData: TreeNode[]) => treeData,
  updateFilePaths: (node: TreeNode, newPath: string) => {
    for (const child of node.children ?? []) {
      child.key = child.key.replace(node.key, newPath);
    }
  },
}));

import {
  createFile,
  createFolder,
  deleteFileOrFolder,
  moveFileOrFolder,
  rename,
} from "./treeAction";

describe("tree actions", () => {
  const tempRoots: string[] = [];

  function createTempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keep-notes-tree-"));
    tempRoots.push(root);
    return root;
  }

  afterEach(() => {
    showMessageBox.mockReset();
    trashItem.mockReset();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("moves a file to the system trash without showing a native confirmation dialog", async () => {
    const root = createTempRoot();
    const filePath = path.join(root, "daily.md");
    fs.writeFileSync(filePath, "content");
    const treeData: TreeNode[] = [{ title: "daily.md", key: filePath }];
    trashItem.mockImplementation(async (targetPath: string) => {
      fs.rmSync(targetPath, { force: true });
    });

    const result = await deleteFileOrFolder(filePath, "daily.md", treeData);

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(trashItem).toHaveBeenCalledWith(filePath);
    expect(result).toMatchObject({
      code: CodeResult.Success,
      data: { treeData: [] },
    });
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("moves a file without showing a native confirmation dialog", async () => {
    const root = createTempRoot();
    const sourcePath = path.join(root, "daily.md");
    const targetPath = path.join(root, "archive");
    fs.writeFileSync(sourcePath, "content");
    fs.mkdirSync(targetPath);
    const treeData: TreeNode[] = [
      { title: "daily.md", key: sourcePath },
      { title: "archive", key: targetPath, children: [] },
    ];

    const result = await moveFileOrFolder(sourcePath, targetPath, treeData);

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(result).toMatchObject({ code: CodeResult.Success });
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(fs.existsSync(path.join(targetPath, "daily.md"))).toBe(true);
  });

  it("keeps loaded folder metadata when moving a directory", async () => {
    const root = createTempRoot();
    const sourcePath = path.join(root, "drafts");
    const targetPath = path.join(root, "archive");
    const nestedFilePath = path.join(sourcePath, "daily.md");
    fs.mkdirSync(sourcePath);
    fs.mkdirSync(targetPath);
    fs.writeFileSync(nestedFilePath, "content");
    const treeData: TreeNode[] = [
      {
        title: "drafts",
        key: sourcePath,
        children: [{ title: "daily.md", key: nestedFilePath }],
        isLoaded: true,
      },
      {
        title: "archive",
        key: targetPath,
        children: [],
        isLoaded: true,
      },
    ];

    const result = await moveFileOrFolder(sourcePath, targetPath, treeData);
    const movedPath = path.join(targetPath, "drafts");
    const movedNode = result.data?.treeData[1].children?.[0];

    expect(movedNode).toMatchObject({
      title: "drafts",
      key: movedPath,
      isLoaded: true,
      children: [{ key: path.join(movedPath, "daily.md") }],
    });
  });

  it("rejects an existing file name with a user-facing message", async () => {
    const root = createTempRoot();
    const filePath = path.join(root, "daily.md");
    fs.writeFileSync(filePath, "existing");
    const treeData: TreeNode[] = [{ title: "daily.md", key: filePath }];

    const result = await createFile(root, "daily", treeData);

    expect(result).toMatchObject({
      code: CodeResult.Fail,
      message: "“daily.md”已存在，请使用其他名称",
    });
    expect(fs.readFileSync(filePath, "utf8")).toBe("existing");
  });

  it("rejects an existing folder name with a user-facing message", async () => {
    const root = createTempRoot();
    const folderPath = path.join(root, "archive");
    fs.mkdirSync(folderPath);
    const treeData: TreeNode[] = [
      { title: "archive", key: folderPath, children: [] },
    ];

    const result = await createFolder(root, "archive", treeData);

    expect(result).toMatchObject({
      code: CodeResult.Fail,
      message: "“archive”已存在，请使用其他名称",
    });
  });

  it("supports renaming a file by changing only its letter case", async () => {
    const root = createTempRoot();
    const sourcePath = path.join(root, "daily.md");
    const targetPath = path.join(root, "Daily.md");
    fs.writeFileSync(sourcePath, "content");
    const treeData: TreeNode[] = [{ title: "daily.md", key: sourcePath }];

    const result = await rename(sourcePath, "Daily", treeData);

    expect(result.code).toBe(CodeResult.Success);
    expect(fs.readdirSync(root)).toEqual(["Daily.md"]);
    expect(result.data?.treeData[0]).toMatchObject({
      title: "Daily.md",
      key: targetPath,
    });
  });

  it("supports renaming a folder by changing only its letter case", async () => {
    const root = createTempRoot();
    const sourcePath = path.join(root, "archive");
    const targetPath = path.join(root, "Archive");
    fs.mkdirSync(sourcePath);
    const treeData: TreeNode[] = [
      { title: "archive", key: sourcePath, children: [] },
    ];

    const result = await rename(sourcePath, "Archive", treeData);

    expect(result.code).toBe(CodeResult.Success);
    expect(fs.readdirSync(root)).toEqual(["Archive"]);
    expect(result.data?.treeData[0]).toMatchObject({
      title: "Archive",
      key: targetPath,
    });
  });

  it("does not overwrite an existing rename target", async () => {
    const root = createTempRoot();
    const sourcePath = path.join(root, "draft.md");
    const targetPath = path.join(root, "published.md");
    fs.writeFileSync(sourcePath, "draft");
    fs.writeFileSync(targetPath, "published");
    const treeData: TreeNode[] = [
      { title: "draft.md", key: sourcePath },
      { title: "published.md", key: targetPath },
    ];

    const result = await rename(sourcePath, "published", treeData);

    expect(result).toMatchObject({
      code: CodeResult.Fail,
      message: "“published.md”已存在，请使用其他名称",
    });
    expect(fs.readFileSync(sourcePath, "utf8")).toBe("draft");
    expect(fs.readFileSync(targetPath, "utf8")).toBe("published");
  });
});
