import type { ApiResponse } from './api'

declare global {
  interface Window {
    api: {
      onWinMinimize: () => void
      onWinMaximize: () => void
      onWinClose: () => void
      openDialog: () => Promise<
        ApiResponse<{
          treeRoot: FileTreeNode
          treeData: FileTreeNode[]
          selectedPath: string
        }>
      >
      readFileContent: (path: string) => Promise<string>
      writeFileContent: (path: string, content: string) => Promise<void>
      updateLocalDirectory: (
        treeData: FileTreeNode[],
        path: string,
      ) => Promise<void>
      getSelectedPath: () => Promise<string | null>
      pathJoin: (...paths: string[]) => string
      pathBasename: (filePath: string) => string
      pathNormalize: (filePath: string) => string
      createFile: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => Promise<ApiResponse<{ treeData: FileTreeNode[] }>>
      createFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => Promise<ApiResponse<{ treeData: FileTreeNode[] }>>
      rename: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => Promise<ApiResponse<{ treeData: FileTreeNode[] }>>
      deleteFileOrFolder: (
        path: string,
        title: string,
        treeData: FileTreeNode[],
      ) => Promise<ApiResponse<{ treeData: FileTreeNode[] }>>
      genDirTreByPath: (
        selectedPath: string,
      ) => Promise<
        ApiResponse<{ treeData: FileTreeNode[], treeRoot: FileTreeNode }>
      >
      moveFileOrFolder: (
        sourcePath: string,
        targetPath: string,
        treeData: FileTreeNode[],
      ) => Promise<ApiResponse<{ treeData: FileTreeNode[] }>>
    }
    git: {
      download: (gitConfig: GitConfig) => Promise<ApiResponse>
      upload: (gitConfig: GitConfig) => Promise<ApiResponse>
    }
  }
}
