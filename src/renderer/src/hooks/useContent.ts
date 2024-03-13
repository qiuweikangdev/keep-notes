import { ref } from 'vue'

const content = ref<string>('')
const contentFilePath = ref<string>('')
export default function useContent() {
  const setContent = (c) => {
    content.value = c
  }
  const setContentFilePath = (filePath) => {
    contentFilePath.value = filePath
  }
  const writeFileContent = (content) => {
    if (contentFilePath.value) {
      window.api.writeFileContent(contentFilePath.value, content)
    }
  }

  return {
    content,
    setContent,
    contentFilePath,
    setContentFilePath,
    writeFileContent,
  }
}
