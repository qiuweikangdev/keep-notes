import { ref } from 'vue'
import { Octokit } from '@octokit/rest'
import { createOrUpdateTextFile } from '@octokit/plugin-create-or-update-text-file'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { fileTreeSort, parseFileContent } from '@renderer/utils/file'
import { useStore } from '@renderer/store/index'

export default function useGithub() {
  const { accessToken, username, localPath, repositoryName } = useStore()

  const MyOctokit = Octokit.plugin(createOrUpdateTextFile)
  const uploadSyncLoading = ref(false)
  const downloadLoading = ref(false)

  const getRepoInfo = async () => {
    // 获取仓库信息
    const octokit = new MyOctokit({ auth: accessToken.value })
    const { data: repoInfo } = await octokit.repos.get({
      owner: username.value,
      repo: repositoryName.value,
    })

    const defaultBranch = repoInfo.default_branch
    return {
      defaultBranch,
    }
  }

  // 上传文件到github
  const uploadFile = async ({ filePath, content }) => {
    try {
      uploadSyncLoading.value = true
      const octokit = new MyOctokit({ auth: accessToken.value })
      const { defaultBranch } = await getRepoInfo()

      const { updated } = await octokit.createOrUpdateTextFile({
        owner: username.value,
        repo: repositoryName.value,
        path: filePath,
        message: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        content,
        branch: defaultBranch,
      })
      return updated
    }
    catch (e: any) {
      message.error(e.toString())
      return false
    }
    finally {
      uploadSyncLoading.value = false
    }
  }

  // 批量上传文件到github
  const batchUploadFile = async (fileListContent: any[]) => {
    try {
      const fileUpdateList: boolean[] = [] // 文件是否有更新
      for (const fileItem of fileListContent) {
        const updatedStatus = await uploadFile({
          filePath: fileItem.filePath,
          content: fileItem.content,
        })
        fileUpdateList.push(updatedStatus)
      }
      if (fileUpdateList.includes(true))
        message.success('上传成功！')
      else message.warning('文件内容没有发生修改！')
    }
    catch (e: any) {
      message.warning(e.toString())
    }
  }

  // 获取所有文件内容，生成目录树
  async function genDirectory(path = ''): Promise<FileTreeNode[]> {
    const fileTreeList: FileTreeNode[] = []
    const octokit = new MyOctokit({ auth: accessToken.value })
    const { data: contents } = await octokit.repos.getContent({
      owner: username.value,
      repo: repositoryName.value,
      path, // 空字符串表示根目录
    })

    for (const content of contents as any[]) {
      if (content.type === 'file' && content.name.endsWith('.md')) {
        const { data: fileContent }: any = await octokit.repos.getContent({
          owner: username.value,
          repo: repositoryName.value,
          path: content.path,
        })
        fileTreeList.push({
          filePath: fileContent.path,
          sysPath: window.api.pathJoin(localPath.value, fileContent.path),
          fileName: fileContent.name,
          title: fileContent.name,
          key: fileContent.path,
          content: parseFileContent(fileContent.content),
        })
      }
      else if (content.type === 'dir') {
        // 递归处理子目录
        const children = await genDirectory(content.path)
        fileTreeList.push({
          filePath: content.path,
          sysPath: window.api.pathJoin(localPath.value, content.path),
          fileName: content.name,
          title: content.name,
          key: content.path,
          children,
        })
      }
    }

    return fileTreeSort(fileTreeList)
  }

  async function downloadFile(): Promise<FileTreeNode[] | null> {
    try {
      downloadLoading.value = true
      const treeData = await genDirectory()
      await window.api.updateLocalDirectory(treeData, localPath.value)
      return treeData
    }
    catch (e: any) {
      message.error(e.toString())
      return null
    }
    finally {
      downloadLoading.value = false
    }
  }

  return {
    uploadFile,
    batchUploadFile,
    uploadSyncLoading,
    downloadFile,
    downloadLoading,
  }
}
