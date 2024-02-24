<template>
  <div class="tree-wrapper min-w-[200px] h-full">
    <a-directory-tree
      v-model:expandedKeys="expandedKeys"
      v-model:selectedKeys="selectedKeys"
      multiple
      :tree-data="treeData"
    >
      <template #title="{ title }">
        <span class="pl-[6px]">{{ title }}</span>
      </template>
    </a-directory-tree>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { TreeProps } from 'ant-design-vue'

const expandedKeys = ref<string[]>(['0-0', '0-1'])
const selectedKeys = ref<string[]>([])
const treeData: TreeProps['treeData'] = [
  {
    title: '测试1',
    key: '0-0',
    children: [
      {
        title: '测试1-1',
        key: '0-0-0',
        isLeaf: true,
      },
      {
        title: '测试1-2',
        key: '0-0-1',
        isLeaf: true,
      },
    ],
  },
  {
    title: '测试2',
    key: '0-1',
    children: [
      {
        title: '测试2-1',
        key: '0-1-0',
        isLeaf: true,
      },
      {
        title: '测试2-2',
        key: '0-1-1',
        isLeaf: true,
      },
    ],
  },
]
</script>
