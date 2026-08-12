import path from "node:path";

export function normalizeMarkdownFilePath(
  targetPath: string,
  cwd = process.cwd(),
): string | null {
  const trimmedPath = targetPath.trim();
  if (!trimmedPath || path.extname(trimmedPath).toLowerCase() !== ".md") {
    return null;
  }

  return path.resolve(cwd, trimmedPath);
}

export function getMarkdownFilePathsFromCommandLine(
  commandLine: readonly string[],
  cwd = process.cwd(),
): string[] {
  const paths = new Set<string>();

  for (const argument of commandLine) {
    const markdownPath = normalizeMarkdownFilePath(argument, cwd);
    if (markdownPath) paths.add(markdownPath);
  }

  return [...paths];
}
