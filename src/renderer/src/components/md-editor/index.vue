<template>
  <div class="md-editor h-full">
    <toolbar :editor-info="editorInfo"></toolbar>
    <milkdown class="flex-1 flex w-full" @click="autoFocus" />
    <bottom-bar :size="size"></bottom-bar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Toolbar from './Toolbar.vue'
import { Milkdown } from '@milkdown/vue'
import { usePlayground } from '@renderer/hooks/usePlayground'
import BottomBar from '@renderer/components/bottom-bar/index.vue'

const content = ref('')

const { editorInfo, autoFocus, size } = usePlayground(content)
</script>
