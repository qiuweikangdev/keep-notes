module.exports = {
  generateNotes(_pluginConfig, context) {
    const commits = context.commits.filter(
      (commit) => !commit.message?.startsWith("Merge "),
    );
    const comparedWith = context.lastRelease?.gitTag || "initial release";

    // 补充 semantic-release 默认发布说明没有展示的提交统计信息。
    return [
      "## Commit Summary",
      "",
      `- Compared with: ${comparedWith}`,
      `- Total commits: ${commits.length}`,
    ].join("\n");
  },
};
