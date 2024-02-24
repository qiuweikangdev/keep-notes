import { BrowserWindow } from 'electron/main'

export function getBrowserWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}
