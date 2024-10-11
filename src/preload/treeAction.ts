import { ipcRenderer } from 'electron/renderer'

export async function createFile(path, title, treeData) {
  return await ipcRenderer.invoke('handle:create-file', path, title, treeData)
}

export async function createFolder(path, title, treeData) {
  return await ipcRenderer.invoke(
    'handle:create-folder',
    path,
    title,
    treeData,
  )
}

export async function rename(path, title, treeData) {
  return await ipcRenderer.invoke('handle:rename', path, title, treeData)
}

export async function deleteFileOrFolder(path, title, treeData) {
  return await ipcRenderer.invoke(
    'handle:delete-fileOrFolder',
    path,
    title,
    treeData,
  )
}

export async function moveFileOrFolder(sourcePath, targetPath, treeData) {
  return await ipcRenderer.invoke(
    'handle:move-fileOrFolder',
    sourcePath,
    targetPath,
    treeData,
  )
}
