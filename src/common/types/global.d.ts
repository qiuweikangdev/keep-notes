import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onWinMinimize: () => void
      onWinMaximize: () => void
      onWinClose: () => void
    }
  }
}
