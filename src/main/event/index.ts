import { ipcMain } from 'electron/main'
import fileIpc from './fileIPC'
import treeIpc from './treeIPC'
import gitIpc from './gitIPC'

function registerIPCHandlers(ipcHandler) {
  Object.entries(ipcHandler).forEach(([eventName, handler]: any) => {
    if (eventName.startsWith('handle')) {
      ipcMain.handle(eventName, handler)
    }
    else if (eventName.startsWith('on')) {
      ipcMain.on(eventName, handler)
    }
  })
}

registerIPCHandlers(fileIpc)
registerIPCHandlers(treeIpc)
registerIPCHandlers(gitIpc)
