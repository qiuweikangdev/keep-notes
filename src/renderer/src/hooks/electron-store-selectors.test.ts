import { describe, expect, it, vi } from "vitest";

import {
  selectAddRecentFolder,
  selectIncrementReloadKey,
  selectSetContent,
  selectSetTreeData,
  selectSetWorkspaceTree,
} from "./electron-store-selectors";

describe("electron store selectors", () => {
  it("keeps tree action references stable across unrelated state updates", () => {
    const setTreeData = () => undefined;
    const setWorkspaceTree = vi.fn();
    const addRecentFolder = () => undefined;
    const initialState = {
      setTreeData,
      setWorkspaceTree,
      addRecentFolder,
      selectedKey: null,
    } as unknown as Parameters<typeof selectSetTreeData>[0];
    const updatedState = {
      ...initialState,
      selectedKey: "notes/a.md",
    };

    expect(selectSetTreeData(updatedState)).toBe(setTreeData);
    expect(selectSetWorkspaceTree(updatedState)).toBe(setWorkspaceTree);
    expect(selectAddRecentFolder(updatedState)).toBe(addRecentFolder);
  });

  it("keeps editor action references stable across content updates", () => {
    const setContent = () => undefined;
    const incrementReloadKey = () => undefined;
    const initialState = {
      setContent,
      incrementReloadKey,
      content: "",
    } as unknown as Parameters<typeof selectSetContent>[0];
    const updatedState = { ...initialState, content: "changed" };

    expect(selectSetContent(updatedState)).toBe(setContent);
    expect(selectIncrementReloadKey(updatedState)).toBe(incrementReloadKey);
  });
});
