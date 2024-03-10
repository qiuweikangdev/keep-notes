import { ipcRenderer } from 'electron/renderer'

// 打开系统目录
export async function openDialog() {
  return await ipcRenderer.invoke('open-directory')
}

export async function readFileContent(filePath: string) {
  return await ipcRenderer.invoke('read-file-content', filePath)
}
