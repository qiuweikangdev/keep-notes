import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onWinMinimize: () => void
      onWinMaximize: () => void
      onWinClose: () => void
      openDialog: () => { treeRoot: FileTreeNode, treeData: FileTreeNode[] }
      readFileContent: (path: string) => void
      writeFileContent: (path: string, content: string) => void
      updateLocalDirectory: (treeData: FileTreeNode[], path: string) => void
      getSelectedPath: () => string | null
      pathJoin: (...paths: string[]) => string
      pathBasename: (filePath: string) => string
      createFile: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => { code: number, message: string, treeData: FileTreeNode[] }
      createFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => { code: number, message: string, treeData: FileTreeNode[] }
    }
  }
}
