import { afterEach, describe, expect, it } from "vitest";

import { resolveRichPreviewAnchor } from "./rich-preview-anchor";

describe("resolveRichPreviewAnchor", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("resolves the exact offset across nested text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-block-id="block-a"><p><span>Hello </span><strong>world</strong></p></div>`;
    document.body.append(root);
    const text = root.querySelector("strong")!.firstChild!;

    expect(resolveRichPreviewAnchor(text, 3)).toEqual({
      blockId: "block-a",
      textOffset: 9,
    });
  });

  it("walks text inside nested lists", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-block-id="block-list"><ul><li>Parent<ul><li><span>Nested </span><em>item</em></li></ul></li></ul></div>`;
    document.body.append(root);
    const text = root.querySelector("em")!.firstChild!;

    expect(resolveRichPreviewAnchor(text, 2)).toEqual({
      blockId: "block-list",
      textOffset: 15,
    });
  });

  it("uses the closest block wrapper for nested blocks", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-block-id="block-parent">Parent<div data-block-id="block-child"><span>Child </span><strong>text</strong></div></div>`;
    document.body.append(root);
    const text = root.querySelector("strong")!.firstChild!;

    expect(resolveRichPreviewAnchor(text, 2)).toEqual({
      blockId: "block-child",
      textOffset: 8,
    });
  });

  it("clamps an offset to the target text node", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-block-id="block-a"><span>Hello </span><strong>world</strong></div>`;
    document.body.append(root);
    const text = root.querySelector("strong")!.firstChild!;

    expect(resolveRichPreviewAnchor(text, 99)).toEqual({
      blockId: "block-a",
      textOffset: 11,
    });
    expect(resolveRichPreviewAnchor(text, -4)).toEqual({
      blockId: "block-a",
      textOffset: 6,
    });
  });

  it.each([
    ["normal space", " "],
    ["non-breaking space", "\u00a0"],
  ])("counts a semantic %s text node before the target", (_label, space) => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-block-id="block-space"><span>A</span><span>${space}</span><strong>B</strong></div>`;
    document.body.append(root);
    const text = root.querySelector("strong")!.firstChild!;

    expect(resolveRichPreviewAnchor(text, 0)).toEqual({
      blockId: "block-space",
      textOffset: 2,
    });
  });

  it("falls back to the block start for a non-text image target", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-block-id="block-image"><p>Caption</p><img alt="Preview" /></div>`;
    document.body.append(root);
    const image = root.querySelector("img")!;

    expect(resolveRichPreviewAnchor(image, 4)).toEqual({
      blockId: "block-image",
      textOffset: 0,
    });
  });
});
