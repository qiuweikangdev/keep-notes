<template>
  <a-tabs v-model:active-key="activeKey" centered>
    <a-tab-pane v-for="tab of tabList" :key="tab.value" :tab="tab.label">
      <component :is="tab.components" />
    </a-tab-pane>
  </a-tabs>
</template>

<script setup lang="ts">
import { LeftAreaEnum } from '@common/types/enum'
import { defineAsyncComponent, ref } from 'vue'

const activeKey = ref<LeftAreaEnum>(LeftAreaEnum.File)

const tabList = [
  {
    label: '文件',
    value: LeftAreaEnum.File,
    components: defineAsyncComponent(
      () => import('./components/dir-tree/index.vue'),
    ),
  },
  {
    label: '大纲',
    value: LeftAreaEnum.Outline,
    components: defineAsyncComponent(
      () => import('./components/outline/index.vue'),
    ),
  },
]
</script>
