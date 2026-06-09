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

export function hasNoHeadVersion(
  status: { created: string[]; not_added: string[] },
  filePath: string,
): boolean {
  const normalizedPath = normalizePath(filePath).toLocaleLowerCase();
  return [...status.created, ...status.not_added].some(
    (candidate) =>
      normalizePath(candidate).toLocaleLowerCase() === normalizedPath,
  );
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
