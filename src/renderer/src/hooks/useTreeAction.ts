import { useStore } from '@renderer/store'
import { message } from 'ant-design-vue'

export default function useContextMenuAction() {
  const { setTreeData } = useStore()
  const contextMenuList = [
    {
      title: '新建文件',
      key: 'createFile',
    },
    {
      title: '新建文件夹',
      key: 'createFolder',
    },
    {
      title: '删除',
      key: 'delete',
    },
    {
      title: '重命名',
      key: 'rename',
    },
    {
      title: '移动',
      key: 'move',
    },
  ]

  const createFile = async (path, title, treeData) => {
    const result = await window.api.createFile(path, title, treeData)
    if (result.code === 0) {
      message.error(result.message.toString())
      return
    }
    setTreeData(result.treeData)
  }

  return {
    contextMenuList,
    createFile,
  }
}
