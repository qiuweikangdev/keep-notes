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
          @click="handleAction(item.command)"
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
import type { CmdKey } from '@milkdown/core'
import { callCommand } from '@milkdown/utils'
import type { FunctionalComponent } from 'vue'
import { toRefs } from 'vue'
import type { UseEditorReturn } from '@milkdown/vue'
import type { AntdIconProps } from '@ant-design/icons-vue/lib/components/AntdIcon'

interface ToolbarListType {
  icon: FunctionalComponent<AntdIconProps>
  tooltip: string
  command: () => CmdKey<any>
}

const props = withDefaults(defineProps<ToolbarPropsType>(), {})

const toolbarList: ToolbarListType[] = [
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
]

interface ToolbarPropsType {
  editorInfo: UseEditorReturn | undefined
}

const { editorInfo } = toRefs(props)

function handleAction(command: () => CmdKey<any>, payload?: any) {
  if (command()) {
    editorInfo.value?.get()?.action(callCommand(command(), payload))
  }
}
</script>
