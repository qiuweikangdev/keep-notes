import { defineStore } from 'pinia'
import { reactive, toRefs } from 'vue'

export interface GithubInfo {
  username: string
  email: string
  localPath: string
  repoUrl: string
}

export const useUserStore = defineStore(
  'user',
  () => {
    const githubInfo = reactive<GithubInfo>({
      username: '',
      email: '',
      localPath: '',
      repoUrl: '',
    })

    const setGithubInfo = (data: Partial<GithubInfo>) => {
      Object.assign(githubInfo, { ...data })
    }

    return { ...toRefs(githubInfo), githubInfo, setGithubInfo }
  },
  {
    persist: true,
  },
)
