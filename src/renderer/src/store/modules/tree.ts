import { CodeResult } from '@common/types/enum'
import { defineStore } from 'pinia'
import { reactive, toRefs } from 'vue'

interface TreeInfo {
  treeData: FileTreeNode[]
  treeRoot: FileTreeNode
}
export const useTreeStore = defineStore(
  'tree',
  () => {
    const treeInfo = reactive<TreeInfo>({
      treeData: [],
      treeRoot: { title: '', key: '' },
    })

    const setTreeInfo = (data: Partial<TreeInfo>) => {
      Object.assign(treeInfo, data)
    }

    // 更新节点内容
    const updateTreeNodeContent = (
      treeData: FileTreeNode[],
      targetKey: string,
      value: string,
    ) => {
      for (const node of treeData) {
        if (node.key === targetKey) {
          node.content = value
          break
        }
        if (node.children) {
          updateTreeNodeContent(node.children, targetKey, value)
        }
      }
      return treeData
    }

    // 更新目录树
    const updateTreeInfo = async (localPath) => {
      const { code, data } = await window.api.genDirTreByPath(localPath)
      if (code === CodeResult.Success) {
        const { treeData, treeRoot } = data || {}
        setTreeInfo({
          treeData,
          treeRoot,
        })
      }
    }

    return {
      ...toRefs(treeInfo),
      treeInfo,
      setTreeInfo,
      updateTreeNodeContent,
      updateTreeInfo,
    }
  },
  {
    persist: true,
  },
)
