import { CodeResult } from '@common/types/enum'
import { message } from 'ant-design-vue'
import { ref } from 'vue'
import { useTreeStore } from '@renderer/store/modules/tree'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@renderer/store/modules/user'
import useContent from './useContent'

export default function useGithub() {
  const { updateTreeInfo } = useTreeStore()
  const userStore = useUserStore()
  const { localPath, repoUrl, username, email } = storeToRefs(userStore)

  const { contentFilePath, setContent } = useContent()
  const downloadLoading = ref(false)
  const uploadLoading = ref(false)

  const download = async () => {
    try {
      downloadLoading.value = true
      const result = await window.git.download({
        dir: localPath.value,
        username: username.value,
        email: email.value,
        repoUrl: repoUrl.value,
      })
      if (result.code === CodeResult.Fail && result.message) {
        message.error(result.message)
        return
      }
      await updateTreeInfo(localPath.value)
      const content = await window.api.readFileContent(contentFilePath.value)
      setContent(content)
      message.success(result.message)
    }
    finally {
      downloadLoading.value = false
    }
  }

  const upload = async () => {
    try {
      uploadLoading.value = true
      const result = await window.git.upload({
        dir: localPath.value,
        username: username.value,
        email: email.value,
        repoUrl: repoUrl.value,
      })
      if (result.code === CodeResult.Fail && result.message) {
        message.error(result.message)
        return
      }
      message.success(result.message)
    }
    finally {
      uploadLoading.value = false
    }
  }

  return {
    download,
    upload,
    downloadLoading,
    uploadLoading,
  }
}
