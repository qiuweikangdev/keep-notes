import { onMounted, reactive, ref, toRefs, watch } from 'vue'

const treeData = ref<FileTreeNode[]>([])

const githubInfo = reactive({
  username: '',
  repositoryName: '',
  accessToken: '',
  localPath: '',
})

export function useStore() {
  const setTreeData = (data: FileTreeNode[]) => {
    treeData.value = data
  }

  const setGithubInfo = (data) => {
    Object.assign(githubInfo, data)
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
    treeData,
    githubInfo,
    ...toRefs(githubInfo),
    setTreeData,
    setGithubInfo,
  }
}
