import { expect, it } from "vitest";
import {
  moveFilePath,
  registerFilePathMove,
  relocatedPath,
} from "./file-path-move";

it("only relocates the moved file and its descendants", () => {
  expect(relocatedPath("/notes/old/a.md", "/notes/old", "/notes/new")).toBe(
    "/notes/new/a.md",
  );
  expect(relocatedPath("/notes/older/a.md", "/notes/old", "/notes/new")).toBe(
    "/notes/older/a.md",
  );
});

it("releases prepared participants and leaves the queue usable after failure", async () => {
  const results: boolean[] = [];
  const remove = registerFilePathMove(
    async () => (moved) => results.push(moved),
  );
  try {
    await expect(
      moveFilePath("a", "b", async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await moveFilePath("a", "b", async () => {});
    expect(results).toEqual([false, true]);
  } finally {
    remove();
  }
});
