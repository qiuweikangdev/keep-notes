<template>
  <div class="tree-wrapper">
    <a-directory-tree
      v-model:selected-keys="selectedKeys"
      v-model:expanded-keys="expandedKeys"
      block-node
      :tree-data="outlineTree"
      :field-names="fieldNames"
      :show-icon="false"
      :height="treeHeight"
      @select="handleSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ProvideStateEnum } from '@common/types/enum'
import { useCrepe } from '@renderer/hooks/useCrepe'
import type { PanelConfig } from '@renderer/views/home/hooks/useHome'
import type { TreeProps } from 'ant-design-vue'
import { head } from 'lodash-es'
import { computed, inject, ref } from 'vue'

const { outlineTree } = useCrepe()

const selectedKeys = ref<any[]>([])
const expandedKeys = ref<any[]>([])

const fieldNames: TreeProps['fieldNames'] = {
  title: 'text',
}

const panelConfig = inject<PanelConfig>(ProvideStateEnum.PanelConfig)

const treeHeight = computed(() => {
  if (panelConfig?.panelHeight.value) {
    return panelConfig?.panelHeight.value - 10 - 34 - 24 - 60
  }
  return window.innerHeight
})

function handleSelect(selectedKeys) {
  const curNodeId = head(selectedKeys) as string
  if (curNodeId) {
    document.getElementById(curNodeId)?.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>
