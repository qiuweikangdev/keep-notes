<template>
  <div class="tree-wrapper">
    <a-directory-tree
      block-node
      :tree-data="outlineTree"
      :field-names="fieldNames"
      :show-icon="false"
      :height="treeHeight"
    />
  </div>
</template>

<script setup lang="ts">
import { ProvideStateEnum } from '@common/types/enum'
import { useCrepe } from '@renderer/hooks/useCrepe'
import type { PanelConfig } from '@renderer/views/home/hooks/useHome'
import type { TreeProps } from 'ant-design-vue'
import { computed, inject } from 'vue'

const { outlineTree } = useCrepe()

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
</script>
