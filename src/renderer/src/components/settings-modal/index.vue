<template>
  <a-modal v-model:open="open" :footer="null">
    <div class="flex">
      <a-menu
        v-model:selected-keys="selectedKeys"
        :items="menuItem"
        :theme="theme"
        class="bg-transparent w-[120px] min-h-[350px]"
      />
      <component :is="renderComp" />
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import useTheme from '@renderer/hooks/useTheme'
import { find, head } from 'lodash-es'
import { computed, defineAsyncComponent, ref } from 'vue'

const open = defineModel('open', { type: Boolean, default: false })

const selectedKeys = ref(['sync-settings'])

const { theme } = useTheme()

const menuItem = computed(() => [
  {
    key: 'sync-settings',
    label: 'Github',
    components: defineAsyncComponent(
      () => import('./components/sync-settings/index.vue'),
    ),
  },
  {
    key: 'dir-settings',
    label: '目录主题',
    components: defineAsyncComponent(
      () => import('./components/dir-settings/index.vue'),
    ),
  },
])

const renderComp = computed(
  () =>
    find(menuItem.value, item => item.key === head(selectedKeys.value))
      ?.components,
)
</script>
