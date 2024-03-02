<template>
  <div
    class="flex justify-center items-center bg-transparent border-t-[1px] dark:border-dark-color"
  >
    <div
      v-for="(item, index) in toolbarList"
      :key="index"
      class="px-[12px] hover:bg-[#F2F2F2] hover:dark:bg-dark-color-hover mx-[8px] rounded-full"
    >
      <a-tooltip :title="item.tooltip" placement="bottom">
        <component
          :is="item.icon"
          class="text-[#8e8e94] py-[12px] hover:font-bold hover:text-[#c0835d] text-[22px]"
          @click="handleAction(item)"
        />
      </a-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AliyunOutlined,
  BoldOutlined,
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

interface ToolbarPropsType {
  editorInfo: UseEditorReturn | undefined
}

const { editorInfo } = toRefs(props)

function handleAction(item: MenuActionOptions) {
  item.handle?.()
  item.command && editorInfo.value?.get()?.action(callCommand(item.command()))
}
</script>
