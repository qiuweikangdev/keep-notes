<template>
  <div class="md-editor h-full">
    <splitpanes class="default-theme" horizontal @resize="handleResize">
      <pane ref="topPanelSizeRef" class="max-h-[50px]">
        <toolbar :editor-info="editorInfo" />
      </pane>
      <pane class="flex flex-col h-full flex-1">
        <milkdown
          class="flex-1 flex w-full"
          spellcheck="false"
          :style="{ maxHeight: editorMaxHeight }"
        />
        <bottom-bar
          :total="total"
          :panel-size="panelSize"
          @toggle-collapse="emits('toggle-collapse')"
        />
      </pane>
    </splitpanes>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import { Milkdown } from '@milkdown/vue'
import { usePlayground } from '@renderer/hooks/usePlayground'
import BottomBar from '@renderer/components/bottom-bar/index.vue'
import Toolbar from './Toolbar.vue'

withDefaults(defineProps<{ panelSize?: number }>(), { panelSize: 30 })

const emits = defineEmits(['toggle-collapse'])

const content = ref('')
const topPanelSizeRef = ref()
const topHeight = ref(50)

const { editorInfo, total } = usePlayground(content)

const editorMaxHeight = computed(() => {
  return `calc(100vh - (${topHeight.value}px + 80px))`
})

function handleResize() {
  topHeight.value = topPanelSizeRef.value.$el.clientHeight
}
</script>
