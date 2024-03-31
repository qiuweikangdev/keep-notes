import process from 'node:process'
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { onWinClose, onWinMaximize, onWinMinimize } from './menu'
import {
  openDialog,
  readFileContent,
  transformSysPath,
  updateLocalDirectory,
  writeFileContent,
} from './file'

// Custom APIs for renderer
const api = {
  onWinClose,
  onWinMaximize,
  onWinMinimize,
  openDialog,
  readFileContent,
  writeFileContent,
  updateLocalDirectory,
  transformSysPath,
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
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
}
