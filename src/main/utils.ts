import { dirname, normalize } from 'node:path'
import fs from 'node:fs'
import { BrowserWindow } from 'electron/main'
import { cloneDeep } from 'lodash-es'

const fsPromises = fs.promises

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
export async function treeDataSort(treeData, isHandlerChildren = true) {
  const newTreeData = cloneDeep(treeData)

  // 获取文件和目录的 stat 信息
  const statsPromises = newTreeData.map(async (node) => {
    const stat = await fsPromises.stat(node.key)
    const isDirectory = stat.isDirectory()

    // 递归处理子节点
    if (isHandlerChildren && node.children) {
      node.children = await treeDataSort(node.children)
    }

    return { ...node, isDirectory }
  })

  const nodesWithStats = await Promise.all(statsPromises)

  // 进行排序
  nodesWithStats.sort((a, b) => {
    const isDirA = a.isDirectory
    const isDirB = b.isDirectory

    if (isDirA && !isDirB) {
      return -1 // 目录排在前
    }
    else if (!isDirA && isDirB) {
      return 1 // 文件排在后
    }
    else {
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase())
    }
  })

  return nodesWithStats
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
