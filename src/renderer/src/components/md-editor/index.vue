<template>
  <div class="md-editor h-full">
    <splitpanes class="default-theme" horizontal @resize="handleResize">
      <pane ref="topPanelSizeRef" class="max-h-[50px]">
        <toolbar :editor-info="editorInfo" />
      </pane>
      <pane class="flex flex-col h-full flex-1">
        <milkdown class="flex-1 flex w-full" spellcheck="false" />
        <bottom-bar
          :total="total"
          :panel-size="panelSize"
          @toggle-collapse="(collapsed) => emits('toggle-collapse', collapsed)"
        />
      </pane>
    </splitpanes>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import { Milkdown } from '@milkdown/vue'
import { usePlayground } from '@renderer/hooks/usePlayground'
import BottomBar from '@renderer/components/bottom-bar/index.vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import Toolbar from './Toolbar.vue'

withDefaults(defineProps<{ panelSize?: number }>(), {
  panelSize: panelConfig.leftPanelSize,
})

const emits = defineEmits(['toggle-collapse'])

const { content } = useContent()
const topPanelSizeRef = ref()
const topHeight = ref(50)

const { editorInfo, total } = usePlayground(content)

function handleResize() {
  topHeight.value = topPanelSizeRef.value.$el.clientHeight
}
</script>

<style scoped lang="less">
.md-editor {
  :deep(.milkdown .editor) {
    max-height: 200px;
  }
}
</style>
