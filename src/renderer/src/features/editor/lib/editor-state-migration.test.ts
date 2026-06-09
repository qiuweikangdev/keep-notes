import { describe, expect, it } from "vitest";

import { normalizePersistedPanelGroups } from "./editor-state-migration";

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
