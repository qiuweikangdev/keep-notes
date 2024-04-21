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

export default function useContextMenuAction() {
  const { setTreeInfo } = useStore()
  const contextMenuList: ContextMenu[] = [
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

  const createFile = async (path, title, treeData) => {
    const result = await window.api.createFile(path, title, treeData)
    if (result.code === 0 && result.message) {
      message.error(result.message.toString())
      return
    }
    setTreeInfo({ treeData: result.treeData })
  }

  const createFolder = async (path, title, treeData) => {
    const result = await window.api.createFolder(path, title, treeData)
    if (result.code === 0) {
      message.error(result.message.toString())
      return
    }
    setTreeInfo({ treeData: result.treeData })
  }

  const rename = async (path, title, treeData) => {
    const result = await window.api.rename(path, title, treeData)
    if (result.code === 0 && result.message) {
      message.error(result.message.toString())
      return
    }
    setTreeInfo({ treeData: result.treeData })
  }

  const deleteFileOrFolder = async (path, title, treeData) => {
    const result = await window.api.deleteFileOrFolder(path, title, treeData)
    if (result.code === 0 && result.message) {
      message.error(result.message.toString())
      return
    }
    setTreeInfo({ treeData: result.treeData })
  }

  return {
    contextMenuList,
    createFile,
    createFolder,
    rename,
    deleteFileOrFolder,
  }
}
