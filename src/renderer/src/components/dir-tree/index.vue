<template>
  <div ref="containerRef" class="tree-wrapper h-full w-full">
    <template v-if="treeData?.length">
      <a-directory-tree
        v-model:expandedKeys="expandedKeys"
        v-model:selectedKeys="selectedKeys"
        :height="panelHeight - 10"
        :tree-data="treeData"
        block-node
        class="min-w-[50px] h-full bg-color-action-bar dark:bg-dark-color-action-bar"
        @select="handleSelect"
      >
        <template #title="{ title }">
          <span class="pl-[6px]">{{ title }}</span>
        </template>
      </a-directory-tree>
    </template>
    <template v-else>
      <upload v-show="panelWidth > 2" @success="handleUploadSuccess" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { TreeProps } from 'ant-design-vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import Upload from './components/upload.vue'

withDefaults(defineProps<{ panelWidth?: number, panelHeight?: number }>(), {
  panelWidth: panelConfig.leftPanelSize,
  panelHeight: window.innerHeight,
})

const containerRef = ref(HTMLElement)
const expandedKeys = ref<string[]>()
const selectedKeys = ref<string[]>([])
const treeData = ref<TreeProps['treeData']>([])

const { setContent } = useContent()

function handleUploadSuccess(tree) {
  treeData.value = tree || []
}

async function handleSelect(_, info) {
  const { node } = info
  const { fileName, filePath } = node || {}
  if (fileName.endsWith('md')) {
    const content = await window.api.readFileContent(filePath)
    setContent(content)
  }
}
</script>
