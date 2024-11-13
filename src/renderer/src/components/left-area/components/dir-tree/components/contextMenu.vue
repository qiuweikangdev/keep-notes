<template>
  <a-dropdown :trigger="['contextmenu']" class="inline-block w-full">
    <span class="pl-[4px]">{{ title }}</span>
    <template #overlay>
      <a-menu
        @click="
          ({ key: menuKey, item: { title: menuTitle } }) =>
            handleContextMenuClick(
              nodeKey,
              title,
              menuKey as ContextMenuKey,
              menuTitle as string,
            )
        "
      >
        <a-menu-item
          v-for="item in contextMenuData"
          :key="item.key"
          :title="item.title"
        >
          {{ item.title }}
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup lang="ts">
import { ContextMenuKey, contextMenuList } from '@renderer/hooks/useTreeAction'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ title: string, nodeKey: string, isRootNode?: boolean }>(),
  { isRootNode: false },
)

const emits = defineEmits(['menu'])

const contextMenuData = computed(() => {
  return contextMenuList.filter(item =>
    props.isRootNode
      ? ![
          ContextMenuKey.Delete,
          ContextMenuKey.Move,
          ContextMenuKey.Rename,
        ].includes(item.key)
      : item.key,
  )
})

function handleContextMenuClick(
  nodeKey: string,
  nodeTitle: string,
  menuKey: ContextMenuKey,
  menuTitle: string,
) {
  emits('menu', { nodeKey, nodeTitle, menuKey, menuTitle })
}
</script>
