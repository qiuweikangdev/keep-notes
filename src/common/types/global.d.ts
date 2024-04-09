import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onWinMinimize: () => void
      onWinMaximize: () => void
      onWinClose: () => void
      openDialog: () => void
      readFileContent: (path: string) => void
      writeFileContent: (path: string, content: string) => void
      updateLocalDirectory: (treeData: FileTreeNode[], path: string) => void
      getSelectedPath: () => string | null
      pathJoin: (...paths: string[]) => string
      createFile: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => { code: number, message: string, treeData: FileTreeNode[] }
    }
  }
}
