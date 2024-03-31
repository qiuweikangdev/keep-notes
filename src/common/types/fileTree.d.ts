interface FileTreeNode {
  fileName: string
  filePath: string
  sysPath?: string
  title: string
  key: string
  children?: TreeNode[]
  content?: string
}
