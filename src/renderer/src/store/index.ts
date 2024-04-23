import { onMounted, reactive, toRefs, watch } from 'vue'

interface TreeInfo {
  treeData: FileTreeNode[]
  treeRoot: FileTreeNode
}

interface GithubInfo {
  username: string
  repositoryName: string
  accessToken: string
  localPath: string
}

const treeInfo = reactive<TreeInfo>({
  treeData: [],
  treeRoot: { title: '', key: '' },
})

const githubInfo = reactive<GithubInfo>({
  username: '',
  repositoryName: '',
  accessToken: '',
  localPath: '',
})

export function useStore() {
  const setTreeInfo = (data: Partial<TreeInfo>) => {
    Object.assign(treeInfo, data)
  }

  const setGithubInfo = (data: Partial<GithubInfo>) => {
    Object.assign(githubInfo, data)
  }

  function updateTreeNodeContent(
    treeData: FileTreeNode[],
    targetKey: string,
    value: string,
  ) {
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

  onMounted(() => {
    const githubInfoStorage = JSON.parse(
      localStorage.getItem('githubInfo') || '{}',
    )
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
  }
}
