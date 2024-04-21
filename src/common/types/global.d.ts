import type { ElectronAPI } from '@electron-toolkit/preload'

interface ApiResponse {
  code: number
  message: string
  treeData: FileTreeNode[]
}

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
      ) => ApiResponse
      createFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => ApiResponse
      rename: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => ApiResponse
      deleteFileOrFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => ApiResponse
    }
  }
}
