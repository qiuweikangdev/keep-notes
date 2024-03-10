import { ref } from 'vue'

const content = ref<string>('')
export default function useContent() {
  const setContent = (c) => {
    content.value = c
  }

  return { content, setContent }
}
