<template>
  <div class="md-editor h-full">
    <splitpanes class="default-theme" horizontal>
      <pane class="max-h-[50px]">
        <toolbar :editor-info="editorInfo"></toolbar>
      </pane>
      <pane class="flex flex-col h-full flex-1">
        <milkdown class="flex-1 flex w-full" @click="autoFocus" />
        <bottom-bar :size="size" @toggle-collapse="emits('toggle-collapse')"></bottom-bar>
      </pane>
    </splitpanes>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import Toolbar from './Toolbar.vue'
import { Milkdown } from '@milkdown/vue'
import { usePlayground } from '@renderer/hooks/usePlayground'
import BottomBar from '@renderer/components/bottom-bar/index.vue'

const content = ref('')

const { editorInfo, autoFocus, size } = usePlayground(content)

const emits = defineEmits(['toggle-collapse'])
</script>
