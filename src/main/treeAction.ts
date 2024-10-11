import fs from 'node:fs'
import { basename, dirname, join, normalize, sep } from 'node:path'
import { dialog } from 'electron'
import { CodeResult } from '@common/types/enum'
import { includes } from 'lodash-es'
import {
  deleteTreeNode,
  findNodeByKey,
  treeDataSort,
  updateFilePaths,
} from './utils'

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
      code: CodeResult.Fail,
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
    }
    if (isFolder) {
      newItem.children = []
    }
    if (targetNode) {
      if (targetNode.children) {
        targetNode.children.push(newItem)
      }
      else {
        treeData.push(newItem)
      }
    }
    else {
      treeData.push(newItem)
    }
    return {
      code: CodeResult.Success,
      message: isFolder ? '文件夹创建成功' : '文件创建成功',
      data: {
        treeData: treeDataSort(treeData),
      },
    }
  }
  catch (e) {
    return {
      code: CodeResult.Fail,
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
      code: CodeResult.Fail,
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
    }
    return {
      code: CodeResult.Success,
      message: '重命名成功',
      data: {
        treeData: treeDataSort(treeData),
      },
    }
  }
  catch (e) {
    return {
      code: CodeResult.Fail,
      message: e,
    }
  }
}

async function deleteItem(path, treeData, isFile = false) {
  try {
    if (isFile) {
      await fsPromises.unlink(path)
    }
    else {
      await fsPromises.rmdir(path, { recursive: true })
    }

    const parentPath = dirname(path)
    const targetNode = findNodeByKey(treeData, parentPath) as FileTreeNode
    if (targetNode) {
      targetNode.children = targetNode?.children?.filter(
        node => normalize(node.key) !== normalize(path),
      )
    }
    else {
      // 根目录
      treeData = treeData.filter(
        node => normalize(node.key) !== normalize(path),
      )
    }

    return {
      code: CodeResult.Success,
      message: isFile ? '文件删除成功' : '文件夹删除成功',
      data: {
        treeData,
      },
    }
  }
  catch (e) {
    return {
      code: CodeResult.Fail,
      message: e,
    }
  }
}

// 删除文件或文件夹
export async function deleteFileOrFolder(path, title, treeData) {
  const result = await fsPromises.stat(path)
  const { response } = await dialog.showMessageBox({
    title: '警告',
    message: `是否要删除 ${title}`,
    type: 'warning',
    buttons: ['确定', '取消'],
  })

  if (response === 0) {
    return await deleteItem(path, treeData, result.isFile())
  }
  else {
    return { code: CodeResult.Fail }
  }
}

// 移动文件或文件夹
export async function moveFileOrFolder(sourcePath, targetPath, treeData) {
  try {
    const sourceResult = await fsPromises.stat(sourcePath)
    const targetResult = await fsPromises.stat(targetPath)
    const isFile = sourceResult.isFile()
    const isTargetFile = targetResult.isFile()

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['确定', '取消'],
      title: '确认移动',
      message: `确认将 ${basename(sourcePath)} 移动到 ${basename(targetPath)} 吗？`,
      cancelId: -1,
    })

    if ([1, -1].includes(response)) {
      return { code: CodeResult.Fail }
    }

    // 确保目标路径是一个文件夹，并构造新的目标路径
    const newPath = isTargetFile
      ? join(dirname(targetPath), basename(sourcePath))
      : join(targetPath, basename(sourcePath))

    const newTargetPath = isTargetFile ? dirname(targetPath) : targetPath
    // 检查目标路径是否已存在同名文件或文件夹
    const targetPathResult = await fsPromises.readdir(newTargetPath)
    if (includes(targetPathResult, basename(sourcePath))) {
      return {
        code: CodeResult.Fail,
        message: `目标路径(${basename(targetPath)}) 已存在 ${basename(sourcePath)} ${isFile ? '文件' : '目录'}`,
      }
    }

    // 移动文件或文件夹
    await fsPromises.rename(sourcePath, newPath)

    // 删除对应原节点
    const newTreeData = deleteTreeNode(treeData, sourcePath)
    // 移动节点
    const targetNode = findNodeByKey(newTreeData, newTargetPath)

    if (targetNode) {
      targetNode.children.push({
        key: newPath,
        title: basename(newPath),
      })
    }

    return {
      code: CodeResult.Success,
      data: {
        treeData: treeDataSort(newTreeData),
      },
    }
  }
  catch (e) {
    return {
      code: CodeResult.Fail,
      message: e,
    }
  }
}
