export function toGitRelativePath(
  repositoryRoot: string,
  filePath: string,
): string {
  const normalizedRoot = normalizePath(repositoryRoot).replace(/\/+$/, "");
  const normalizedFile = normalizePath(filePath);
  const rootPrefix = `${normalizedRoot}/`;

  if (
    normalizedFile
      .toLocaleLowerCase()
      .startsWith(rootPrefix.toLocaleLowerCase())
  ) {
    return normalizedFile.slice(rootPrefix.length);
  }

  return normalizedFile.replace(/^\/+/, "");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
