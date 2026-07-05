const { writeFileSync } = require("node:fs");

const [, , version, gitTag] = process.argv;

if (!version || !gitTag) {
  throw new Error("Missing semantic-release version or git tag.");
}

// 将 semantic-release 的发布结果落盘，方便 GitHub Actions 后续矩阵任务读取 tag 和版本号。
writeFileSync(
  ".semantic-release-result.json",
  `${JSON.stringify({ version, gitTag }, null, 2)}\n`,
);
