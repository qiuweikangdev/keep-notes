<template>
  <div class="md-editor h-full">
    <splitpanes class="default-theme" horizontal>
      <pane class="max-h-[50px]">
        <toolbar :editor-info="editorInfo" />
      </pane>
      <pane class="flex flex-col h-full flex-1">
        <milkdown class="flex-1 flex w-full" />
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
import { ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import { Milkdown } from '@milkdown/vue'
import { usePlayground } from '@renderer/hooks/usePlayground'
import BottomBar from '@renderer/components/bottom-bar/index.vue'
import Toolbar from './Toolbar.vue'

withDefaults(defineProps<{ panelSize?: number }>(), { panelSize: 30 })

const emits = defineEmits(['toggle-collapse'])

const content = ref('')

const { editorInfo, total } = usePlayground(content)
</script>
