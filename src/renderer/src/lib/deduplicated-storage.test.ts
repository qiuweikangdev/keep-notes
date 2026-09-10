import { describe, expect, it, vi } from "vitest";
import { createDeduplicatedStorage } from "./deduplicated-storage";

describe("deduplicated editor persistence", () => {
  it("writes changed preferences once and respects external storage changes", () => {
    localStorage.clear();
    const write = vi.spyOn(Storage.prototype, "setItem");
    const storage = createDeduplicatedStorage(localStorage);
    storage.setItem("settings", "first");
    storage.setItem("settings", "first");
    expect(write).toHaveBeenCalledTimes(1);
    localStorage.setItem("settings", "external");
    storage.setItem("settings", "first");
    expect(localStorage.getItem("settings")).toBe("first");
    expect(write).toHaveBeenCalledTimes(3);
    storage.removeItem("settings");
    expect(storage.getItem("settings")).toBeNull();
    write.mockRestore();
  });
});
