import { describe, expect, it } from "vitest";

import {
  findTextMatches,
  getSteppedMatchIndex,
  replaceAllTextMatches,
  replaceTextMatch,
} from "./find-in-file";

describe("find-in-file", () => {
  it("finds case-insensitive literal matches by default", () => {
    expect(findTextMatches("Note note NOTE", "note")).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ]);
  });

  it("honors match case and whole word options", () => {
    expect(
      findTextMatches("cat category Cat", "cat", {
        matchCase: true,
        wholeWord: true,
      }),
    ).toEqual([{ start: 0, end: 3 }]);
  });

  it("supports regular expression searches", () => {
    expect(
      findTextMatches("todo-1 todo-20 done", String.raw`todo-\d+`, {
        useRegex: true,
      }),
    ).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 14 },
    ]);
  });

  it("returns no matches for empty or invalid searches", () => {
    expect(findTextMatches("abc", "")).toEqual([]);
    expect(findTextMatches("abc", "[", { useRegex: true })).toEqual([]);
  });

  it("steps through matches with wraparound", () => {
    expect(getSteppedMatchIndex(-1, 3, 1)).toBe(0);
    expect(getSteppedMatchIndex(2, 3, 1)).toBe(0);
    expect(getSteppedMatchIndex(0, 3, -1)).toBe(2);
    expect(getSteppedMatchIndex(0, 0, 1)).toBe(-1);
  });

  it("replaces the selected match and all matches", () => {
    const matches = findTextMatches("one two one", "one");

    expect(replaceTextMatch("one two one", matches[1], "three")).toBe(
      "one two three",
    );
    expect(replaceAllTextMatches("one two one", matches, "three")).toBe(
      "three two three",
    );
  });
});
