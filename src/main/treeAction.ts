import fs from 'node:fs'
import { dirname, sep } from 'node:path'
import { genColor } from '@common/utils/color'
import { findNodeByKey, treeDataSort, updateFilePaths } from './utils'

const fsPromises = fs.promises

async function createItem(path, title, treeData, isFolder = false) {
  const result = await fsPromises.stat(path)
  const dealPath = result.isFile() ? dirname(path) : path
  const newPath = isFolder
    ? `${dealPath}${sep}${title}`
    : `${dealPath}${sep}${title}.md`
  const isExists = fs.existsSync(newPath)
  if (isExists) {
    return {
      code: 0,
      message: isFolder ? '该文件夹已存在' : '该文件已存在',
    }
  }
  try {
    if (isFolder) {
      await fsPromises.mkdir(newPath, { recursive: true })
    }
    else {
      await fsPromises.writeFile(newPath, '', { encoding: 'utf-8' })
    }
    const targetNode = findNodeByKey(treeData, dealPath) as FileTreeNode
    const newItem: FileTreeNode = {
      title: isFolder ? title : `${title}.md`,
      key: newPath,
      color: genColor(title),
    }
    if (isFolder) {
      newItem.children = []
    }
    if (targetNode) {
      targetNode.children
        ? targetNode.children.push(newItem)
        : treeData.push(newItem)
      treeDataSort(targetNode.children || treeData)
    }
    else {
      treeData.push(newItem)
      treeDataSort(treeData)
    }
    return {
      code: 1,
      message: isFolder ? '文件夹创建成功' : '文件创建成功',
      treeData,
    }
  }
  catch (e) {
    return {
      code: 0,
      message: e,
    }
  }
}

// 新建文件
export async function createFile(path, title, treeData) {
  return createItem(path, title, treeData, false)
}

// 新建文件夹
export async function createFolder(path, title, treeData) {
  return createItem(path, title, treeData, true)
}

// 重命名文件或文件夹
export async function rename(path, title, treeData) {
  const result = await fsPromises.stat(path)
  const parentPath = dirname(path)
  const curTitle = result.isFile() ? `${title}.md` : title
  const newPath = `${parentPath}${sep}${curTitle}`
  const isExists = fs.existsSync(newPath)
  if (isExists) {
    return {
      code: 0,
      message: '已存在文件/文件夹',
    }
  }
  try {
    await fsPromises.rename(path, newPath)
    const targetNode = findNodeByKey(treeData, path) as FileTreeNode
    if (targetNode) {
      updateFilePaths(targetNode, newPath)
      targetNode.title = curTitle
      targetNode.key = newPath
      treeDataSort(treeData)
    }
    return {
      code: 1,
      message: '重命名成功',
      treeData,
    }
  }
  catch (e) {
    return {
      code: 0,
      message: e,
    }
  }
}
