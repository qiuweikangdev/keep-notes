import { ipcRenderer } from 'electron/renderer'

export async function download(gitConfig: GitConfig) {
  return await ipcRenderer.invoke('handle:git-download', gitConfig)
}

export async function upload(gitConfig: GitConfig) {
  return await ipcRenderer.invoke('handle:git-upload', gitConfig)
}
