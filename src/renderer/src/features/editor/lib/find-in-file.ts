export interface TextMatch {
  start: number;
  end: number;
}

export interface FindTextOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

const EMPTY_MATCH_GUARD = 1;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchPattern(query: string, options: FindTextOptions): RegExp {
  const source = options.useRegex ? query : escapeRegExp(query);
  const wholeWordSource = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.matchCase ? "g" : "gi";
  return new RegExp(wholeWordSource, flags);
}

export function findTextMatches(
  text: string,
  query: string,
  options: FindTextOptions = {},
): TextMatch[] {
  if (!query) return [];

  let pattern: RegExp;
  try {
    pattern = buildSearchPattern(query, options);
  } catch {
    return [];
  }

  const matches: TextMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[0];
    if (value.length === 0) {
      pattern.lastIndex += EMPTY_MATCH_GUARD;
      continue;
    }
    matches.push({ start: match.index, end: match.index + value.length });
  }
  return matches;
}

export function getSteppedMatchIndex(
  currentIndex: number,
  matchCount: number,
  direction: 1 | -1,
): number {
  if (matchCount === 0) return -1;
  if (currentIndex < 0) return direction === 1 ? 0 : matchCount - 1;
  return (currentIndex + direction + matchCount) % matchCount;
}

export function replaceTextMatch(
  text: string,
  match: TextMatch | null | undefined,
  replacement: string,
): string {
  if (!match) return text;
  return `${text.slice(0, match.start)}${replacement}${text.slice(match.end)}`;
}

export function replaceAllTextMatches(
  text: string,
  matches: TextMatch[],
  replacement: string,
): string {
  if (matches.length === 0) return text;

  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.start);
    result += replacement;
    cursor = match.end;
  }
  return result + text.slice(cursor);
}
