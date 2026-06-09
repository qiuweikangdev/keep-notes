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
      mode: "rich",
      loadStatus: "ready",
      saveStatus: "dirty",
      errorMessage: null,
      parseErrorMessage: null,
      scrollTop: 0,
    });
  });
});

describe("normalizePersistedAppearance", () => {
  const defaults = {
    fontSize: 16,
    lineHeight: 1.8,
    opacity: 100,
    padding: 60,
    showModeSwitcher: true,
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

  it("preserves an explicit hidden mode switcher setting", () => {
    expect(
      normalizePersistedAppearance(defaults, {
        showModeSwitcher: false,
      }).showModeSwitcher,
    ).toBe(false);
  });
});
