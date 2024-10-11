import { CodeResult } from '@common/types/enum'
import { defineStore, storeToRefs } from 'pinia'
import { onBeforeMount, reactive, toRefs } from 'vue'
import { useUserStore } from './user'

export type TreeInfo = {
  treeData: FileTreeNode[]
  treeRoot: FileTreeNode
}

export type DirSettings = {
  dirColor: DirColorEnum
  showIcon: boolean
}

export enum DirColorEnum {
  MultiColor = 'multiColor', // 色彩颜色
  ThemeColor = 'themeColor', // 跟随主题
}

export const useTreeStore = defineStore(
  'tree',
  () => {
    const userStore = useUserStore()
    const { localPath } = storeToRefs(userStore)

    const treeInfo = reactive<TreeInfo>({
      treeData: [],
      treeRoot: { title: '', key: '' },
    })

    const dirSettings = reactive<DirSettings>({
      dirColor: DirColorEnum.ThemeColor,
      showIcon: false,
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

    onBeforeMount(() => {
      if (localPath.value) {
        updateTreeInfo(localPath.value)
      }
    })

    return {
      ...toRefs(treeInfo),
      treeInfo,
      setTreeInfo,
      updateTreeNodeContent,
      updateTreeInfo,
      dirSettings,
    }
  },
  {
    persist: true,
  },
)
