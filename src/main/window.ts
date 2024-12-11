import { join } from 'node:path'
import process from 'node:process'
import { BrowserWindow, app, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const windowConfig = {
  width: 900,
  height: 670,
  minWidth: 400,
  minHeight: 400,
  show: false,
  frame: false,
  autoHideMenuBar: false,
  ...(process.platform === 'linux' ? { icon } : {}),
  webPreferences: {
    preload: join(__dirname, '../preload/index.mjs'),
    sandbox: false,
  },
}

export function createWindow() {
  const win = new BrowserWindow({
    ...windowConfig,
  })
  if (!app.isPackaged) {
    win.webContents.openDevTools()
  }

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
