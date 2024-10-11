import process from 'node:process'
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { onWinClose, onWinMaximize, onWinMinimize } from './menu'
import {
  genDirTreByPath,
  getSelectedPath,
  openDialog,
  pathBasename,
  pathJoin,
  pathNormalize,
  readFileContent,
  updateLocalDirectory,
  writeFileContent,
} from './file'
import {
  createFile,
  createFolder,
  deleteFileOrFolder,
  moveFileOrFolder,
  rename,
} from './treeAction'
import * as git from './git'

// Custom APIs for renderer
const api = {
  onWinClose,
  onWinMaximize,
  onWinMinimize,
  openDialog,
  readFileContent,
  writeFileContent,
  updateLocalDirectory,
  getSelectedPath,
  pathJoin,
  pathBasename,
  pathNormalize,
  createFile,
  createFolder,
  rename,
  deleteFileOrFolder,
  genDirTreByPath,
  moveFileOrFolder,
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('git', git)
  }
  catch (error) {
    console.error(error)
  }
}
else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
  window.git = { ...git }
}
