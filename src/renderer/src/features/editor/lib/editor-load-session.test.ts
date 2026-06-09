import { describe, expect, it } from "vitest";

import { EditorLoadSession } from "./editor-load-session";

describe("EditorLoadSession", () => {
  it("accepts only the latest request for a tab", () => {
    const session = new EditorLoadSession();
    const first = session.begin("group-1", "tab-1", "a.md");
    const second = session.begin("group-1", "tab-1", "b.md");

    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it("does not mix requests between tabs", () => {
    const session = new EditorLoadSession();
    const left = session.begin("left", "tab", "a.md");
    const right = session.begin("right", "tab", "b.md");

    expect(session.isCurrent(left)).toBe(true);
    expect(session.isCurrent(right)).toBe(true);
  });
});
