import fs from 'node:fs'
import { dirname, sep } from 'node:path'
import { findNodeByKey, treeDataSort } from './utils'

const fsPromises = fs.promises

// 新建文件
export async function createFile(path, title, treeData) {
  const result = await fsPromises.stat(path)
  const dealPath = result.isFile() ? dirname(path) : path
  const newPath = `${dealPath}${sep}${title}.md`
  const isExists = fs.existsSync(newPath)
  if (isExists) {
    return {
      code: 0,
      message: '该文件已存在',
    }
  }
  try {
    await fsPromises.writeFile(newPath, '', { encoding: 'utf-8' })
    const targetNode = findNodeByKey(treeData, dealPath) as FileTreeNode
    if (targetNode.children) {
      targetNode.children.push({
        title: `${title}.md`,
        key: newPath,
        filePath: newPath,
      })
      treeDataSort(targetNode.children)
    }
    else {
      const targetNodeIndex = treeData.findIndex(
        node => node.key === targetNode.key,
      )
      treeData.splice(targetNodeIndex + 1, 0, {
        title: `${title}`,
        key: newPath,
        filePath: newPath,
      })
      treeDataSort(treeData)
    }
    return {
      code: 1,
      message: '文件创建成功',
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

// 新建文件夹
export async function createFolder(path, title, treeData) {
  const result = await fsPromises.stat(path)
  const dealPath = result.isFile() ? dirname(path) : path
  const newPath = `${dealPath}${sep}${title}`
  const isExists = fs.existsSync(newPath)
  if (isExists) {
    return {
      code: 0,
      message: '该文件夹已存在',
    }
  }
  try {
    await fsPromises.mkdir(newPath, { recursive: true })
    const targetNode = findNodeByKey(treeData, dealPath) as FileTreeNode
    if (targetNode?.children) {
      targetNode.children.push({
        title,
        key: newPath,
        filePath: newPath,
        children: [],
      })
      treeDataSort(targetNode.children)
    }
    if (!targetNode) {
      treeData.push({
        title: `${title}`,
        key: newPath,
        filePath: newPath,
        children: [],
      })
      treeDataSort(treeData)
    }
    return {
      code: 1,
      message: '文件夹创建成功',
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
