import { ipcMain } from 'electron/main'
import { getBrowserWindow } from './utils'

export function ipcMenuAction() {
  ipcMain.on('win-minimize', (event) => {
    const win = getBrowserWindow(event)
    win?.minimize()
  })

  ipcMain.on('win-maximize', (event) => {
    const win = getBrowserWindow(event)
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })

  ipcMain.on('win-close', (event) => {
    const win = getBrowserWindow(event)
    win?.close()
  })
}
