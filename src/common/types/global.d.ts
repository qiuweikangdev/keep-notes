import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onWinMinimize: () => void
      onWinMaximize: () => void
      onWinClose: () => void
      openDialog: () => ApiResponse<{
        treeRoot: FileTreeNode
        treeData: FileTreeNode[]
      }>
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
      ) => ApiResponse<{ treeData: FileTreeNode[] }>
      createFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => ApiResponse<{ treeData: FileTreeNode[] }>
      rename: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => ApiResponse<{ treeData: FileTreeNode[] }>
      deleteFileOrFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => ApiResponse<{ treeData: FileTreeNode[] }>
    }
  }
}
