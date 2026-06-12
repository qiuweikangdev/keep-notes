import { describe, expect, it } from "vitest";

import {
  findHoveredTableDeleteTarget,
  getTableDeleteButtonPosition,
  isPointerWithinTableDeleteHoverZone,
  isTableDeleteButtonTarget,
} from "./editor-table-delete-overlay";

describe("editor table delete overlay", () => {
  it("finds the hovered table block id from a table cell target", () => {
    document.body.innerHTML = `
      <div data-node-type="blockContainer" data-id="table-block-1">
        <div data-content-type="table">
          <div class="tableWrapper">
            <table>
              <tbody>
                <tr>
                  <td><p id="cell">A1</p></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const target = document.getElementById("cell");
    const hovered = findHoveredTableDeleteTarget(target);

    expect(hovered?.blockId).toBe("table-block-1");
    expect(hovered?.tableWrapper.className).toBe("tableWrapper");
  });

  it("keeps the overlay visible while hovering the delete button itself", () => {
    document.body.innerHTML = `
      <button type="button" data-keep-notes-table-delete>
        删除
      </button>
    `;

    expect(
      isTableDeleteButtonTarget(
        document.querySelector("[data-keep-notes-table-delete]"),
      ),
    ).toBe(true);
  });

  it("positions the delete button at the top-right of the table wrapper", () => {
    const scrollContainer = document.createElement("div");
    const tableWrapper = document.createElement("div");
    scrollContainer.scrollTop = 20;
    scrollContainer.scrollLeft = 4;

    scrollContainer.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 40,
        right: 640,
        bottom: 700,
        width: 600,
        height: 600,
        x: 40,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    tableWrapper.getBoundingClientRect = () =>
      ({
        top: 180,
        left: 90,
        right: 410,
        bottom: 300,
        width: 320,
        height: 120,
        x: 90,
        y: 180,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(getTableDeleteButtonPosition(tableWrapper, scrollContainer)).toEqual(
      {
        top: 86,
        left: 386,
      },
    );
  });

  it("keeps hover active while the pointer moves from the table to the delete button area", () => {
    const tableWrapper = document.createElement("div");

    tableWrapper.getBoundingClientRect = () =>
      ({
        top: 180,
        left: 90,
        right: 410,
        bottom: 300,
        width: 320,
        height: 120,
        x: 90,
        y: 180,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(isPointerWithinTableDeleteHoverZone(tableWrapper, 420, 170)).toBe(
      true,
    );
    expect(isPointerWithinTableDeleteHoverZone(tableWrapper, 450, 170)).toBe(
      false,
    );
  });
});
