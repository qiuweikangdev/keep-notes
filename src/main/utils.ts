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
export function treeDataSort(treeData, isHandlerChildren = false) {
  treeData.sort((a, b) => {
    const isDirA = !!a.children
    const isDirB = !!b.children

    if (isDirA && !isDirB) {
      return -1
    }
    else if (!isDirA && isDirB) {
      return 1
    }
    else {
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase())
    }
  })

  if (isHandlerChildren) {
    treeData.forEach((node) => {
      if (node.children) {
        node.children = treeDataSort(node.children)
      }
    })
  }
}

export function updateFilePaths(node, newPath) {
  if (node.children && node.children.length > 0) {
    node.children.forEach((child) => {
      child.key = child.key.replace(node.filePath, newPath)
      child.filePath = child.filePath.replace(node.filePath, newPath)
      updateFilePaths(child, newPath)
    })
  }
}
