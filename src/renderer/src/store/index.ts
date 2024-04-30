import { CodeResult } from '@common/types/enum'
import { onMounted, reactive, toRefs, watch } from 'vue'

interface TreeInfo {
  treeData: FileTreeNode[]
  treeRoot: FileTreeNode
}

interface GithubInfo {
  username: string
  email: string
  accessToken: string
  localPath: string
  repoUrl: string
}

const treeInfo = reactive<TreeInfo>({
  treeData: [],
  treeRoot: { title: '', key: '' },
})

const githubInfo = reactive<GithubInfo>({
  username: '',
  email: '',
  accessToken: '',
  localPath: '',
  repoUrl: '',
})

export function useStore() {
  const setTreeInfo = (data: Partial<TreeInfo>) => {
    Object.assign(treeInfo, data)
  }

  const setGithubInfo = (data: Partial<GithubInfo>) => {
    Object.assign(githubInfo, data)
  }

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

  onMounted(() => {
    const githubInfoStorage = JSON.parse(
      localStorage.getItem('githubInfo') || '{}',
    )
    updateTreeInfo(githubInfo.localPath)
    setGithubInfo(githubInfoStorage)
  })

  watch(githubInfo, () => {
    localStorage.setItem('githubInfo', JSON.stringify(githubInfo))
  })

  return {
    treeInfo,
    githubInfo,
    ...toRefs(githubInfo),
    ...toRefs(treeInfo),
    setTreeInfo,
    setGithubInfo,
    updateTreeNodeContent,
    updateTreeInfo,
  }
}
