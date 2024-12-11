import { globalShortcut } from 'electron/main'
import { createWindow } from './window'

export function registerShortcut() {
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    createWindow()
  })
}
