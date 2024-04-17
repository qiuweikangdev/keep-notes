interface FileTreeNode {
  selectable?: boolean
  sysPath?: string
  title: string
  key: string
  children?: TreeNode[]
  content?: string
  color?: string
}
