import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain } from 'electron/main'
import { getBrowserWindow } from './utils'

// 过滤目录
const ignoreDir = ['node_modules']

// 递归读取目录结构，生成目录树
async function readDirectory(directoryPath) {
  try {
    const files = await fs.promises.readdir(directoryPath)

    // 分别存放文件和目录
    const directories: string[] = []
    const markdownFiles: string[] = []

    // 遍历目录下的文件和目录
    for (const file of files) {
      const filePath = path.join(directoryPath, file)
      const stats = await fs.promises.stat(filePath)

      // 过滤掉忽略的目录和隐藏文件
      if (
        stats.isDirectory()
        && !ignoreDir.includes(file)
        && !file.startsWith('.')
      ) {
        directories.push(file)
      }
      else if (['.md', '.txt'].includes(path.extname(file))) {
        markdownFiles.push(file)
      }
    }

    // 对文件和目录进行排序、对文件和目录按照字母顺序进行排序，忽略大小写
    directories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    markdownFiles.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    )

    // 递归读取子目录的目录树
    const directoryTrees = await Promise.all(
      directories.map(async (dir) => {
        const subtree = await readDirectory(path.join(directoryPath, dir))
        return {
          fileName: dir,
          title: dir,
          value: path.join(directoryPath, dir),
          key: path.join(directoryPath, dir),
          children: subtree,
        }
      }),
    )

    // 拼接文件和目录的目录树
    const tree = [
      ...directoryTrees,
      ...markdownFiles.map(file => ({
        fileName: file,
        title: file,
        value: path.join(directoryPath, file),
        key: path.join(directoryPath, file),
      })),
    ]

    return tree
  }
  catch (error) {
    console.error('Error while reading directory:', error)
    return null
  }
}

async function openDialog(win) {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })

    if (!result.canceled) {
      const selectedPath = result.filePaths[0]
      // 递归读取目录结构，生成目录树
      const directoryTree = await readDirectory(selectedPath)
      return directoryTree
    }
    else {
      return []
    }
  }
  catch (error) {
    console.error('Error while opening dialog:', error)
    return null
  }
}

export function ipcFileAction() {
  ipcMain.handle('open-directory', async (event) => {
    const win = getBrowserWindow(event)
    const directoryTree = await openDialog(win)
    return directoryTree
  })
}
