import fs from 'node:fs'
import { sep } from 'node:path'
import { findNodeByKey } from './utils'

const fsPromises = fs.promises

// 新建文件
export async function createFile(path, title, treeData) {
  const newPath = `${path}${sep}${title}.md`
  const isExists = fs.existsSync(newPath)
  if (isExists) {
    return {
      code: 0,
      message: '该文件夹已存在',
    }
  }
  try {
    await fsPromises.writeFile(newPath, '', { encoding: 'utf-8' })
    const targetNode = findNodeByKey(treeData, path) as FileTreeNode
    if (targetNode.children) {
      targetNode.children.push({
        title: `${title}.md`,
        key: newPath,
        filePath: newPath,
      })
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
