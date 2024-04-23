import path from 'node:path'
import { ipcRenderer } from 'electron/renderer'

// 打开系统目录
export async function openDialog() {
  return await ipcRenderer.invoke('handle:open-directory')
}

export async function readFileContent(filePath: string) {
  return await ipcRenderer.invoke('handle:read-file-content', filePath)
}

export async function writeFileContent(filePath: string, content: string) {
  await ipcRenderer.send('on:write-file-content', filePath, content)
}

export async function updateLocalDirectory(treeData, path) {
  await ipcRenderer.send('on:update-local-directory', treeData, path)
}

export async function getSelectedPath() {
  return await ipcRenderer.invoke('handle:get-selected-path')
}

export function pathJoin(...paths: string[]) {
  return path.join(...paths)
}

export function pathBasename(filePath) {
  return path.basename(filePath)
}

export function pathNormalize(filePath) {
  return path.normalize(filePath)
}
