<template>
  <div class="md-editor flex flex-col h-full">
    <!-- <div class="flex flex-col h-full flex-1"> -->
    <tools-action :editor-info="editorInfo" />
    <milkdown class="flex-1 flex w-full" spellcheck="false" />
    <bottom-bar
      :total="total"
      :panel-size="panelSize"
      @toggle-collapse="(collapsed) => emits('toggle-collapse', collapsed)"
    />
    <!-- </div> -->
  </div>
</template>

<script setup lang="ts">
import { Milkdown } from '@milkdown/vue'
import { usePlayground } from '@renderer/hooks/usePlayground'
import BottomBar from '@renderer/components/bottom-bar/index.vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import ToolsAction from '@renderer/components/tools-action/index.vue'

withDefaults(defineProps<{ panelSize?: number }>(), {
  panelSize: panelConfig.leftPanelSize,
})

const emits = defineEmits(['toggle-collapse'])

const { content, writeFileContent } = useContent()

function contentChange(content) {
  writeFileContent(content)
}

const { editorInfo, total } = usePlayground(content, contentChange)
</script>

<style scoped lang="less">
.md-editor {
  :deep(.milkdown .editor) {
    max-height: 200px;
  }
}
</style>
