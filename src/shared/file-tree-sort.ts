const fileTreeCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * 文件树统一使用自然排序，使数字编号按 1、2、10 的顺序展示。
 */
export function compareFileTreeTitles(left: string, right: string) {
  return fileTreeCollator.compare(left, right);
}
