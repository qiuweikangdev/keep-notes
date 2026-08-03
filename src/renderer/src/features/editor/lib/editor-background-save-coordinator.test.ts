import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_EDITOR_SAVE_GROUP_ID,
  EditorBackgroundSaveCoordinator,
} from "./editor-background-save-coordinator";

describe("EditorBackgroundSaveCoordinator", () => {
  it("keeps a background document pending until its flush succeeds", async () => {
    const coordinator = new EditorBackgroundSaveCoordinator();
    const release = vi.fn();
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);

    coordinator.track({
      path: "C:/notes/large.md",
      flush: vi.fn().mockResolvedValue(true),
      getContent: () => "# Latest",
      release,
    });

    expect(coordinator.hasPending()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    await expect(coordinator.flush("C:/notes/large.md")).resolves.toBe(true);
    expect(coordinator.hasPending()).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("returns a retryable close snapshot after disk persistence fails", async () => {
    const coordinator = new EditorBackgroundSaveCoordinator();
    const release = vi.fn();
    const flush = vi.fn().mockResolvedValue(false);

    coordinator.track({
      path: "C:/notes/large.md",
      flush,
      getContent: () => "# Serialized latest",
      release,
    });

    await expect(coordinator.getNextCloseSnapshot()).resolves.toEqual({
      groupId: BACKGROUND_EDITOR_SAVE_GROUP_ID,
      tabId: "C:/notes/large.md",
      filePath: "C:/notes/large.md",
      content: "# Serialized latest",
    });
    expect(coordinator.hasPending()).toBe(true);
    expect(release).not.toHaveBeenCalled();

    expect(
      coordinator.confirmCloseSave(
        BACKGROUND_EDITOR_SAVE_GROUP_ID,
        "C:/notes/large.md",
        "C:/notes/large.md",
        "# Serialized latest",
      ),
    ).toBe(true);
    expect(coordinator.hasPending()).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("retains a failed serialization and retries it during close saving", async () => {
    const coordinator = new EditorBackgroundSaveCoordinator();
    const release = vi.fn();
    const flush = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("serialize failed"))
      .mockResolvedValueOnce(true);

    coordinator.track({
      path: "C:/notes/large.md",
      flush,
      getContent: () => null,
      release,
    });

    await expect(coordinator.flush("C:/notes/large.md")).rejects.toThrow(
      "serialize failed",
    );
    expect(coordinator.hasPending()).toBe(true);
    expect(release).not.toHaveBeenCalled();

    await expect(coordinator.getNextCloseSnapshot()).resolves.toBeNull();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(coordinator.hasPending()).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("coalesces equivalent Windows paths and owns every retention release", async () => {
    const coordinator = new EditorBackgroundSaveCoordinator();
    const firstRelease = vi.fn();
    const latestRelease = vi.fn();
    const firstFlush = vi.fn().mockResolvedValue(true);
    const duplicateFlush = vi.fn().mockResolvedValue(true);

    coordinator.track({
      path: "C:\\notes\\large.md",
      flush: firstFlush,
      getContent: () => "# Latest",
      release: firstRelease,
    });
    coordinator.track({
      path: "C:/notes/large.md",
      flush: duplicateFlush,
      getContent: () => "# Duplicate",
      release: latestRelease,
    });

    expect(coordinator.hasPending("C:\\notes\\large.md")).toBe(true);
    expect(coordinator.hasPending("C:/notes/large.md")).toBe(true);
    expect(firstRelease).not.toHaveBeenCalled();
    expect(latestRelease).not.toHaveBeenCalled();

    await expect(coordinator.flush("C:/notes/large.md")).resolves.toBe(true);
    expect(firstFlush).toHaveBeenCalledOnce();
    expect(duplicateFlush).not.toHaveBeenCalled();
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(latestRelease).toHaveBeenCalledOnce();
  });
});
