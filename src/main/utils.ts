import { BrowserWindow } from 'electron/main'

export function getBrowserWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

export function findNodeByKey(treeData, key) {
  for (const node of treeData) {
    if (node.key === key) {
      return node
    }
    else if (Array.isArray(node.children)) {
      const foundNode = findNodeByKey(node.children, key)
      if (foundNode)
        return foundNode
    }
  }
}

// 对文件和目录进行排序、对文件和目录按照字母顺序进行排序，忽略大小写
export function treeDataSort(treeData) {
  return [...treeData].sort((a, b) =>
    a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
  )
}
