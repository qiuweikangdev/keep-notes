import { EditorView as CodeMirrorView } from "@codemirror/view";

interface EditorCodeViewportContainer {
  getBoundingClientRect: () => Pick<DOMRect, "top">;
}

interface EditorCodeViewportPoint {
  x: number;
  y: number;
}

export interface EditorCodeViewportAnchor {
  topCodeLine: number | null;
  topCodeLineOffset: number;
}

export interface EditorCodeLineTarget {
  getBoundingClientRect: () => Pick<DOMRect, "top"> & {
    bottom?: number;
    height?: number;
  };
}

interface CaretPositionResult {
  offset: number;
  offsetNode: Node;
}

interface CaretDocument extends Document {
  caretPositionFromPoint?: (x: number, y: number) => CaretPositionResult | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

function findCodeMirrorView(block: HTMLElement): CodeMirrorView | null {
  const editorElement = block.querySelector<HTMLElement>(".cm-editor");
  if (!editorElement) return null;

  try {
    return CodeMirrorView.findFromDOM(editorElement);
  } catch {
    return null;
  }
}

function readCodeMirrorLineTop(view: CodeMirrorView, lineNumber: number) {
  const clampedLineNumber = Math.min(
    Math.max(Math.trunc(lineNumber), 1),
    view.state.doc.lines,
  );
  const line = view.state.doc.line(clampedLineNumber);
  return (
    view.coordsAtPos(line.from)?.top ??
    view.documentTop + view.lineBlockAt(line.from).top
  );
}

function findTextPosition(root: Node, offset: number) {
  const walker = root.ownerDocument!.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  let consumed = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (consumed + length >= offset) {
      return { node, offset: Math.max(0, offset - consumed) };
    }
    consumed += length;
  }
  return null;
}

function readRangeRect(root: HTMLElement, textOffset: number) {
  const position = findTextPosition(root, textOffset);
  if (!position) return null;

  const range = root.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.setEnd(position.node, position.offset);
  const rect = range.getBoundingClientRect?.();
  return rect && Number.isFinite(rect.top) ? rect : null;
}

function findPlainCodeElement(block: HTMLElement) {
  return block.querySelector<HTMLElement>("pre code");
}

function findSerializedCodeLines(block: HTMLElement) {
  return Array.from(
    block.querySelectorAll<HTMLElement>(".cm-content > .cm-line"),
  );
}

function readSerializedCodeAnchor(
  block: HTMLElement,
  point: EditorCodeViewportPoint,
): { line: number; top: number } | null {
  const hit = block.ownerDocument
    .elementFromPoint?.(point.x, point.y)
    ?.closest<HTMLElement>(".cm-line");
  if (!hit || !block.contains(hit)) return null;

  const lineIndex = findSerializedCodeLines(block).indexOf(hit);
  return lineIndex < 0
    ? null
    : { line: lineIndex + 1, top: hit.getBoundingClientRect().top };
}

function getLineStartOffset(text: string, lineNumber: number) {
  const targetLine = Math.max(1, Math.trunc(lineNumber));
  let offset = 0;
  for (let line = 1; line < targetLine; line += 1) {
    const nextBreak = text.indexOf("\n", offset);
    if (nextBreak < 0) return text.length;
    offset = nextBreak + 1;
  }
  return offset;
}

function readTextOffset(root: HTMLElement, node: Node, localOffset: number) {
  try {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, localOffset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function readPlainCodeAnchor(
  block: HTMLElement,
  point: EditorCodeViewportPoint,
): { line: number; top: number } | null {
  const code = findPlainCodeElement(block);
  if (!code) return null;
  const ownerDocument = code.ownerDocument as CaretDocument;
  const caret = ownerDocument.caretPositionFromPoint?.(point.x, point.y);
  const range = caret
    ? null
    : ownerDocument.caretRangeFromPoint?.(point.x, point.y);
  const node = caret?.offsetNode ?? range?.startContainer;
  const localOffset = caret?.offset ?? range?.startOffset;
  if (!node || localOffset === undefined || !code.contains(node)) return null;

  const textOffset = readTextOffset(code, node, localOffset);
  if (textOffset === null) return null;
  const text = code.textContent ?? "";
  const line = text.slice(0, textOffset).split("\n").length;
  const target = createPlainCodeLineTarget(code, line);
  const top = target?.getBoundingClientRect().top;
  return top === undefined ? null : { line, top };
}

function createPlainCodeLineTarget(
  code: HTMLElement,
  lineNumber: number,
): EditorCodeLineTarget | null {
  const lineElement = code.querySelector<HTMLElement>(
    `[data-editor-code-line="${Math.max(1, Math.trunc(lineNumber))}"]`,
  );
  if (lineElement) return lineElement;

  const lineStart = getLineStartOffset(code.textContent ?? "", lineNumber);
  if (!findTextPosition(code, lineStart)) return null;
  return {
    getBoundingClientRect: () =>
      readRangeRect(code, lineStart) ?? code.getBoundingClientRect(),
  };
}

export function readEditorCodeViewportAnchor(
  block: HTMLElement,
  container: EditorCodeViewportContainer,
  point: EditorCodeViewportPoint,
): EditorCodeViewportAnchor {
  const containerTop = container.getBoundingClientRect().top;
  const codeMirror = findCodeMirrorView(block);
  if (codeMirror) {
    const position = codeMirror.posAtCoords(point, false);
    if (position !== null) {
      const line = codeMirror.state.doc.lineAt(position).number;
      return {
        topCodeLine: line,
        topCodeLineOffset:
          containerTop - readCodeMirrorLineTop(codeMirror, line),
      };
    }
  }

  const serializedCodeAnchor = readSerializedCodeAnchor(block, point);
  if (serializedCodeAnchor) {
    return {
      topCodeLine: serializedCodeAnchor.line,
      topCodeLineOffset: containerTop - serializedCodeAnchor.top,
    };
  }

  const plainCodeAnchor = readPlainCodeAnchor(block, point);
  return plainCodeAnchor
    ? {
        topCodeLine: plainCodeAnchor.line,
        topCodeLineOffset: containerTop - plainCodeAnchor.top,
      }
    : { topCodeLine: null, topCodeLineOffset: 0 };
}

export function createEditorCodeLineTarget(
  block: HTMLElement,
  lineNumber: number,
): EditorCodeLineTarget | null {
  if (!Number.isFinite(lineNumber) || lineNumber < 1) return null;
  const codeMirror = findCodeMirrorView(block);
  if (codeMirror) {
    return {
      getBoundingClientRect: () => ({
        top: readCodeMirrorLineTop(codeMirror, lineNumber),
      }),
    };
  }

  const serializedLine = findSerializedCodeLines(block).at(
    Math.max(1, Math.trunc(lineNumber)) - 1,
  );
  if (serializedLine) return serializedLine;

  const code = findPlainCodeElement(block);
  return code ? createPlainCodeLineTarget(code, lineNumber) : null;
}
