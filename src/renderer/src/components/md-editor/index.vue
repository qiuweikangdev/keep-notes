<template>
  <div class="md-editor flex flex-col h-full">
    <div
      id="md-editor"
      ref="editorRef"
      class="crepe flex-1 flex w-full"
      spellcheck="false"
    />
    <bottom-bar
      :total="total"
      :panel-size="panelSize"
      @toggle-collapse="(collapsed) => emits('toggle-collapse', collapsed)"
    />
  </div>
</template>

<script setup lang="ts">
import BottomBar from '@renderer/components/bottom-bar/index.vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import { useCrepe } from '@renderer/hooks/useCrepe'
import { ref } from 'vue'

withDefaults(defineProps<{ panelSize?: number }>(), {
  panelSize: panelConfig.leftPanelSize,
})

const emits = defineEmits(['toggle-collapse'])

const editorRef = ref()

const { content, writeFileContent } = useContent()

function contentChange(content) {
  writeFileContent(content)
}

const { total } = useCrepe(editorRef, content, contentChange)
</script>

<style scoped lang="less">
.md-editor {
  :deep(.milkdown .editor) {
    min-height: 200px;
  }
}
</style>
