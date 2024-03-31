import { ipcRenderer } from 'electron/renderer'

// 打开系统目录
export async function openDialog() {
  return await ipcRenderer.invoke('open-directory')
}

export async function readFileContent(filePath: string) {
  return await ipcRenderer.invoke('read-file-content', filePath)
}

export async function writeFileContent(filePath: string, content: string) {
  await ipcRenderer.send('write-file-content', filePath, content)
}

export async function updateLocalDirectory(treeData, path) {
  await ipcRenderer.send('update-local-directory', treeData, path)
}

export async function transformSysPath(treeData, path) {
  return await ipcRenderer.invoke('transform-sys-path', treeData, path)
}

export async function getSelectedPath() {
  return await ipcRenderer.invoke('get-selected-path')
}
