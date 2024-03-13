<template>
  <a-dropdown
    :trigger="['click', 'hover']"
    class="w-fit absolute right-0 top-[44px] cursor-pointer z-[999]"
  >
    <dash-outlined
      class="text-[24px] text-color-icon rounded-[4px] hover:bg-color-icon hover:dark:bg-dark-color-icon/20 px-[12px] hover:text-color-primary-hover"
    />
    <template #overlay>
      <a-menu>
        <a-menu-item v-for="(item, index) in toolbarList" :key="index">
          <div
            class="flex items-center hover:text-color-primary-hover"
            @click="handleAction(item)"
          >
            <component :is="item.icon" class="py-[12px] text-[22px]" />
            <span class="px-[12px]">{{ item.tooltip }}</span>
          </div>
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup lang="ts">
import {
  AliyunOutlined,
  BoldOutlined,
  DashOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue'

import { redoCommand, undoCommand } from '@milkdown/plugin-history'
import {
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark'
import {
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/preset-gfm'
import { callCommand } from '@milkdown/utils'
import { computed, toRefs } from 'vue'
import type { UseEditorReturn } from '@milkdown/vue'
import type { MenuActionOptions } from '@common/types/menu'
import useLink from '@renderer/hooks/useLink'

interface ToolbarPropsType {
  editorInfo: UseEditorReturn
}

const props = withDefaults(defineProps<ToolbarPropsType>(), {})

const { addLink } = useLink()

const toolbarList = computed(
  () =>
    [
      {
        icon: UndoOutlined,
        tooltip: '撤销',
        command: () => undoCommand.key,
      },
      {
        icon: RedoOutlined,
        tooltip: '重做',
        command: () => redoCommand.key,
      },
      {
        icon: BoldOutlined,
        tooltip: '加粗',
        command: () => toggleStrongCommand.key,
      },
      {
        icon: ItalicOutlined,
        tooltip: '斜体',
        command: () => toggleEmphasisCommand.key,
      },
      {
        icon: LinkOutlined,
        tooltip: '链接',
        handle: () => addLink(),
      },
      {
        icon: StrikethroughOutlined,
        tooltip: '删除线',
        command: () => toggleStrikethroughCommand.key,
      },
      {
        icon: AliyunOutlined,
        tooltip: '引用',
        command: () => wrapInBlockquoteCommand.key,
      },
      {
        icon: UnorderedListOutlined,
        tooltip: '无序列表',
        command: () => wrapInBulletListCommand.key,
      },
      {
        icon: OrderedListOutlined,
        tooltip: '有序列表',
        command: () => wrapInOrderedListCommand.key,
      },
      {
        icon: TableOutlined,
        tooltip: '表格',
        command: () => insertTableCommand.key,
      },
    ] as MenuActionOptions[],
)

const { editorInfo } = toRefs(props)

function handleAction(item: MenuActionOptions) {
  item.handle?.()
  item.command && editorInfo.value?.get()?.action(callCommand(item.command()))
}
</script>
