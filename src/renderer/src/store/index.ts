import { reactive, ref, toRefs } from 'vue'

const treeData = ref<FileTreeNode[]>([])

const githubInfo = reactive({
  username: 'qiuweikangdev',
  repositoryName: 'my-test',
  accessToken: '',
  localPath: 'D:\\Desktop\\my-test',
})

export function useStore() {
  const setTreeData = (data: FileTreeNode[]) => {
    treeData.value = data
  }

  const setGithubInfo = (data) => {
    Object.assign(githubInfo, data)
  }

  return {
    treeData,
    githubInfo,
    ...toRefs(githubInfo),
    setTreeData,
    setGithubInfo,
  }
}
