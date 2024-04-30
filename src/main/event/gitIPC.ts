import { download, upload } from '../git'

export default {
  'handle:git-download': async (_, gitConfig: GitConfig) => {
    return await download(gitConfig)
  },
  'handle:git-upload': async (_, gitConfig: GitConfig) => {
    return await upload(gitConfig)
  },
}
