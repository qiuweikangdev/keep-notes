import { describe, expect, it } from "vitest";

import {
  normalizePersistedAppearance,
  normalizePersistedPanelGroups,
} from "./editor-state-migration";

describe("normalizePersistedPanelGroups", () => {
  it("fills editor fields missing from legacy persisted tabs", () => {
    const groups = normalizePersistedPanelGroups([
      {
        id: "group-1",
        activeTabId: "tab-1",
        direction: "horizontal",
        tabs: [
          {
            id: "tab-1",
            filePath: "notes.md",
            content: "# Notes",
            wordCount: 7,
            isDirty: true,
            reloadKey: 2,
          },
        ],
      },
    ]);

    expect(groups[0].tabs[0]).toMatchObject({
      pendingFilePath: null,
      temporaryTitle: null,
      mode: "rich",
      loadStatus: "ready",
      saveStatus: "dirty",
      errorMessage: null,
      parseErrorMessage: null,
      scrollTop: 0,
    });
  });

  it("marks a legacy unnamed rich tab ready for editing", () => {
    const groups = normalizePersistedPanelGroups([
      {
        id: "group-1",
        activeTabId: "tab-1",
        direction: "horizontal",
        tabs: [
          {
            id: "tab-1",
            filePath: null,
            content: "draft",
            wordCount: 5,
            isDirty: true,
            reloadKey: 0,
            mode: "rich",
            loadStatus: "idle",
          },
        ],
      },
    ]);

    expect(groups[0].tabs[0]).toMatchObject({
      mode: "rich",
      loadStatus: "ready",
    });
  });
});

describe("normalizePersistedAppearance", () => {
  const defaults = {
    fontSize: 16,
    uiFontSize: 13,
    lineHeight: 1.8,
    opacity: 100,
    padding: 72,
    showModeSwitcher: true,
    sidebarView: "file" as const,
  };

  it("uses the new default for legacy appearance settings", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        fontSize: 18,
      }),
    ).toEqual({
      ...defaults,
      fontSize: 18,
    });
  });

  it("migrates legacy UI font size to editor content font size", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        fontSize: 16,
        uiFontSize: 18,
      }).fontSize,
    ).toBe(18);
  });

  it("preserves an explicit editor content font size over legacy UI font size", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        fontSize: 17,
        uiFontSize: 18,
      }).fontSize,
    ).toBe(17);
  });

  it("upgrades legacy zero editor padding to the current default", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        padding: 0,
      }).padding,
    ).toBe(defaults.padding);
  });

  it("preserves a positive editor padding setting", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        padding: 80,
      }).padding,
    ).toBe(80);
  });

  it("preserves an explicit hidden mode switcher setting", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        showModeSwitcher: false,
      }).showModeSwitcher,
    ).toBe(false);
  });

  it("always resets sidebarView to file", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        sidebarView: "outline",
      }).sidebarView,
    ).toBe("file");
  });
});
