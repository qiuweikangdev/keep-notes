export interface CodeBlockFoldRange {
  startLine: number;
  endLine: number;
}

export interface CodeBlockVisibleLine {
  lineNumber: number;
  text: string;
  foldedRange?: CodeBlockFoldRange;
}

function getIndentSize(line: string): number {
  let size = 0;

  for (const character of line) {
    if (character === " ") {
      size += 1;
      continue;
    }
    if (character === "\t") {
      size += 2;
      continue;
    }
    break;
  }

  return size;
}

function stripFoldIgnoredSyntax(line: string): string {
  let result = "";
  let quote: "'" | '"' | "`" | null = null;
  let isEscaped = false;

  // 折叠范围只关心结构符号，先忽略字符串和行内注释中的括号。
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (quote) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (character === "\\") {
        isEscaped = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") break;
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }

    result += character;
  }

  return result;
}

function collectBraceFoldRanges(lines: string[]): CodeBlockFoldRange[] {
  const ranges: CodeBlockFoldRange[] = [];
  const stack: Array<{ open: string; lineNumber: number }> = [];
  const closingToOpening: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
  };
  const openingBraces = new Set(["(", "[", "{"]);

  // 用栈匹配跨行括号，让函数、类、对象、数组等同作用域块都能折叠。
  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const foldableCode = stripFoldIgnoredSyntax(line);

    for (const character of foldableCode) {
      if (openingBraces.has(character)) {
        stack.push({ open: character, lineNumber });
        continue;
      }

      const expectedOpen = closingToOpening[character];
      if (!expectedOpen) continue;

      const stackIndex = stack.findLastIndex(
        (entry) => entry.open === expectedOpen,
      );
      if (stackIndex === -1) continue;

      const [entry] = stack.splice(stackIndex, 1);
      if (lineNumber > entry.lineNumber) {
        ranges.push({
          startLine: entry.lineNumber,
          endLine: lineNumber,
        });
      }
    }
  });

  return ranges;
}

function collectHtmlTagFoldRanges(lines: string[]): CodeBlockFoldRange[] {
  const ranges: CodeBlockFoldRange[] = [];
  const stack: Array<{ name: string; lineNumber: number }> = [];
  const tagPattern = /<\/?([A-Za-z][\w:.-]*)(?:\s[^<>]*)?>/g;

  // Vue/HTML 标签折叠应包含闭合标签，否则折叠后闭合标签露出会造成代码结构视觉错位。
  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const matches = line.matchAll(tagPattern);

    for (const match of matches) {
      const rawTag = match[0];
      const tagName = match[1].toLowerCase();
      if (rawTag.startsWith("<!") || rawTag.startsWith("<?")) continue;
      if (rawTag.endsWith("/>")) continue;

      if (rawTag.startsWith("</")) {
        const stackIndex = stack.findLastIndex(
          (entry) => entry.name === tagName,
        );
        if (stackIndex === -1) continue;

        const [entry] = stack.splice(stackIndex, 1);
        if (lineNumber > entry.lineNumber) {
          ranges.push({
            startLine: entry.lineNumber,
            endLine: lineNumber,
          });
        }
        continue;
      }

      stack.push({ name: tagName, lineNumber });
    }
  });

  return ranges;
}

function collectIndentFoldRanges(lines: string[]): CodeBlockFoldRange[] {
  const ranges: CodeBlockFoldRange[] = [];

  // 兼容 Python/YAML 等缩进型语言：下一段缩进更深时认为当前行开启了作用域。
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
    if (!lines[lineIndex].trim()) continue;

    const currentIndent = getIndentSize(lines[lineIndex]);
    let nextLineIndex = lineIndex + 1;
    while (nextLineIndex < lines.length && !lines[nextLineIndex].trim()) {
      nextLineIndex += 1;
    }
    if (nextLineIndex >= lines.length) break;

    const nextIndent = getIndentSize(lines[nextLineIndex]);
    if (nextIndent <= currentIndent) continue;

    let endLineIndex = nextLineIndex;
    for (
      let candidateIndex = nextLineIndex + 1;
      candidateIndex < lines.length;
      candidateIndex += 1
    ) {
      if (!lines[candidateIndex].trim()) {
        endLineIndex = candidateIndex;
        continue;
      }
      if (getIndentSize(lines[candidateIndex]) <= currentIndent) break;
      endLineIndex = candidateIndex;
    }

    ranges.push({
      startLine: lineIndex + 1,
      endLine: endLineIndex + 1,
    });
  }

  return ranges;
}

function isStaticImportStartLine(line: string): boolean {
  const trimmedLine = line.trimStart();

  if (/^import\s*\(/.test(trimmedLine)) return false;
  if (/^import(?:\s+type)?(?:\s+[\w*{"'])/.test(trimmedLine)) return true;

  return /^from\s+[\w.]+\s+import\b/.test(trimmedLine);
}

function getImportBalance(line: string): number {
  return stripFoldIgnoredSyntax(line)
    .split("")
    .reduce((balance, character) => {
      if (character === "{" || character === "[" || character === "(") {
        return balance + 1;
      }
      if (character === "}" || character === "]" || character === ")") {
        return balance - 1;
      }

      return balance;
    }, 0);
}

function getImportStatementEndLineIndex(
  lines: string[],
  startLineIndex: number,
): number {
  let balance = 0;

  // 多行 import 需要先吞掉当前声明自身，再让 import 区域合并相邻声明。
  for (
    let lineIndex = startLineIndex;
    lineIndex < lines.length;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    balance += getImportBalance(line);

    if (balance > 0) continue;
    if (line.trimEnd().endsWith(",")) continue;
    if (line.trimEnd().endsWith("\\")) continue;

    return lineIndex;
  }

  return startLineIndex;
}

function collectImportFoldRanges(lines: string[]): CodeBlockFoldRange[] {
  const ranges: CodeBlockFoldRange[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!isStaticImportStartLine(lines[lineIndex])) continue;

    const regionStartLineIndex = lineIndex;
    let regionEndLineIndex = getImportStatementEndLineIndex(lines, lineIndex);
    lineIndex = regionEndLineIndex + 1;

    while (lineIndex < lines.length) {
      if (!lines[lineIndex].trim()) break;
      if (!isStaticImportStartLine(lines[lineIndex])) break;

      regionEndLineIndex = getImportStatementEndLineIndex(lines, lineIndex);
      lineIndex = regionEndLineIndex + 1;
    }

    if (regionEndLineIndex > regionStartLineIndex) {
      ranges.push({
        startLine: regionStartLineIndex + 1,
        endLine: regionEndLineIndex + 1,
      });
    }

    lineIndex -= 1;
  }

  return ranges;
}

export function getCodeBlockFoldRanges(codeText: string): CodeBlockFoldRange[] {
  const lines = codeText.split("\n");
  const widestRangeByStartLine = new Map<number, CodeBlockFoldRange>();

  for (const range of [
    ...collectBraceFoldRanges(lines),
    ...collectHtmlTagFoldRanges(lines),
    ...collectIndentFoldRanges(lines),
    ...collectImportFoldRanges(lines),
  ]) {
    if (range.endLine <= range.startLine) continue;

    const existingRange = widestRangeByStartLine.get(range.startLine);
    if (!existingRange || range.endLine > existingRange.endLine) {
      widestRangeByStartLine.set(range.startLine, range);
    }
  }

  return [...widestRangeByStartLine.values()].sort(
    (left, right) =>
      left.startLine - right.startLine || right.endLine - left.endLine,
  );
}

export function getCodeBlockVisibleLines(
  codeText: string,
  foldedStartLines: Iterable<number>,
): CodeBlockVisibleLine[] {
  const lines = codeText.split("\n");
  const foldedStartLineSet = new Set(foldedStartLines);
  const foldRangeByStartLine = new Map(
    getCodeBlockFoldRanges(codeText).map((range) => [range.startLine, range]),
  );
  const visibleLines: CodeBlockVisibleLine[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const foldedRange = foldRangeByStartLine.get(lineNumber);

    if (foldedRange && foldedStartLineSet.has(lineNumber)) {
      visibleLines.push({
        lineNumber,
        text: lines[lineIndex],
        foldedRange,
      });
      lineIndex = foldedRange.endLine - 1;
      continue;
    }

    visibleLines.push({
      lineNumber,
      text: lines[lineIndex],
    });
  }

  return visibleLines.length > 0 ? visibleLines : [{ lineNumber: 1, text: "" }];
}
