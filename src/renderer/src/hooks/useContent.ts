import { useStore } from '@renderer/store'
import { ref } from 'vue'

const content = ref<string>('')
const contentFilePath = ref<string>('')
export default function useContent() {
  const { treeData, setTreeInfo, updateTreeNodeContent } = useStore()

  const setContent = (c) => {
    content.value = c
  }
  const setContentFilePath = (filePath) => {
    contentFilePath.value = filePath
  }

  const writeFileContent = (content) => {
    if (contentFilePath.value) {
      window.api.writeFileContent(contentFilePath.value, content)
      const data = updateTreeNodeContent(
        treeData.value,
        contentFilePath.value,
        content,
      )
      setTreeInfo({
        treeData: data,
      })
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
