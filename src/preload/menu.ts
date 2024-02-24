import { ipcRenderer } from 'electron'

export function onWinMinimize() {
  ipcRenderer.send('win-minimize')
}

export function onWinMaximize() {
  ipcRenderer.send('win-maximize')
}

export function onWinClose() {
  ipcRenderer.send('win-close')
}
