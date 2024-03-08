import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain } from 'electron/main'
import { getBrowserWindow } from './utils'

// 递归读取目录结构，生成目录树
async function readDirectory(directoryPath) {
  try {
    const files = await fs.promises.readdir(directoryPath)
    const tree: any[] = []

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(directoryPath, file)
        const stats = await fs.promises.stat(filePath)

        if (stats.isDirectory()) {
          const subtree = await readDirectory(filePath)
          tree.push({
            fileName: file,
            title: file,
            name: file,
            text: file,
            label: file,
            value: filePath,
            key: filePath,
            children: subtree,
          })
        }
        else if (['.md', '.txt'].includes(path.extname(file))) {
          tree.push({
            fileName: file,
            title: file,
            name: file,
            text: file,
            label: file,
            value: filePath,
            key: filePath,
          })
        }
      }),
    )

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
