import { dirname, normalize } from 'node:path'
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
export function treeDataSort(treeData, isHandlerChildren = true) {
  const newTreeData = [...treeData]
  newTreeData.sort((a, b) => {
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
    newTreeData.forEach((node) => {
      if (node.children) {
        node.children = treeDataSort(node.children)
      }
    })
  }

  return newTreeData
}

export function updateFilePaths(node, newPath) {
  if (node.children && node.children.length > 0) {
    node.children.forEach((child) => {
      child.key = child.key.replace(node.key, newPath)
      updateFilePaths(child, newPath)
    })
  }
}

// 删除节点
export function deleteTreeNode(treeData, deleteNodePath) {
  let newTreeData = [...treeData]
  const parentPath = dirname(deleteNodePath)
  const targetNode = findNodeByKey(newTreeData, parentPath) as FileTreeNode
  if (targetNode) {
    targetNode.children = targetNode?.children?.filter(
      node => normalize(node.key) !== normalize(deleteNodePath),
    )
  }
  else {
    // 根目录
    newTreeData = newTreeData.filter(
      node => normalize(node.key) !== normalize(deleteNodePath),
    )
  }
  return newTreeData
}
