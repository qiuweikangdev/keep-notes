import { ipcRenderer } from 'electron/renderer'

export async function createFile(path, title, treeData) {
  return await ipcRenderer.invoke('handle:create-file', path, title, treeData)
}

export async function createFolder(path, title, treeData) {
  return await ipcRenderer.invoke(
    'handle:create-createFolder',
    path,
    title,
    treeData,
  )
}
