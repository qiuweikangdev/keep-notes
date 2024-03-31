import { ipcRenderer } from 'electron/renderer'

// 打开系统目录
export async function openDialog() {
  return await ipcRenderer.invoke('open-directory')
}

export async function readFileContent(filePath: string) {
  return await ipcRenderer.invoke('read-file-content', filePath)
}

export async function writeFileContent(filePath: string, content: string) {
  return await ipcRenderer.send('write-file-content', filePath, content)
}

export async function updateLocalDirectory(treeData, path) {
  return await ipcRenderer.invoke('update-local-directory', treeData, path)
}
