import { useStore } from '@renderer/store'
import { message } from 'ant-design-vue'

export enum ContextMenuKey {
  CreateFile = 'createFile',
  CreateFolder = 'createFolder',
  Delete = 'delete',
  Rename = 'rename',
  Move = 'move',
}

export interface ContextMenu {
  title: string
  key: ContextMenuKey
}

export const contextMenuList: ContextMenu[] = [
  {
    title: '新建文件',
    key: ContextMenuKey.CreateFile,
  },
  {
    title: '新建文件夹',
    key: ContextMenuKey.CreateFolder,
  },
  {
    title: '删除',
    key: ContextMenuKey.Delete,
  },
  {
    title: '重命名',
    key: ContextMenuKey.Rename,
  },
  {
    title: '移动',
    key: ContextMenuKey.Move,
  },
]

export default function useContextMenuAction() {
  const { setTreeInfo } = useStore()

  const handleActionResult = async (actionFn, path, title, treeData) => {
    const result = await actionFn(path, title, treeData)
    if (result.code === 0 && result.message) {
      message.error(result.message.toString())
      return
    }
    setTreeInfo({ treeData: result.treeData })
  }

  const createFile = async (path, title, treeData) => {
    await handleActionResult(window.api.createFile, path, title, treeData)
  }

  const createFolder = async (path, title, treeData) => {
    await handleActionResult(window.api.createFolder, path, title, treeData)
  }

  const rename = async (path, title, treeData) => {
    await handleActionResult(window.api.rename, path, title, treeData)
  }

  const deleteFileOrFolder = async (path, title, treeData) => {
    await handleActionResult(
      window.api.deleteFileOrFolder,
      path,
      title,
      treeData,
    )
  }

  return {
    createFile,
    createFolder,
    rename,
    deleteFileOrFolder,
  }
}
