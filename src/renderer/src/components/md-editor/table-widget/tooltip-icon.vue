<template>
  <div v-for="(item, index) of tooltipList" :key="index">
    <a-tooltip
      v-if="item.show"
      :title="showIconTooltip && item.tooltip"
      placement="bottom"
    >
      <component
        :is="item.icon"
        class="bg-[#fff] p-[12px] text-[#8e8e94] hover:font-bold hover:text-[#c0835d] text-[16px]"
        @click="handleAction(item.command, item.payload)"
      />
    </a-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import { usePluginViewContext } from '@prosemirror-adapter/vue'
import { CellSelection } from '@milkdown/prose/tables'
import { useInstance } from '@milkdown/vue'
import { commandsCtx } from '@milkdown/core'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  deleteSelectedCellsCommand,
  setAlignCommand,
} from '@milkdown/preset-gfm'
import type { $Command } from '@milkdown/utils'

const { view } = usePluginViewContext()
const [loading, getEditor] = useInstance()

const isRow = computed(
  () =>
    view.value.state.selection instanceof CellSelection
    && view.value.state.selection.isRowSelection(),
)
const isCol = computed(
  () =>
    view.value.state.selection instanceof CellSelection
    && view.value.state.selection.isColSelection(),
)
const isWholeTable = computed(() => isRow.value && isCol.value)
const isAny = computed(() => isRow.value || isCol.value)
const isHeading = computed(
  () =>
    isRow.value
    && view.value.state.doc.nodeAt(
      (view.value.state.selection as CellSelection).$headCell.pos,
    )?.type.name === 'table_header',
)

const showIconTooltip = false

const tooltipList = computed(() => {
  return [
    {
      icon: ArrowUpOutlined,
      tooltip: '上移',
      show: !isWholeTable.value && !isHeading.value && isRow.value,
      command: addRowBeforeCommand,
    },
    {
      icon: ArrowLeftOutlined,
      tooltip: '左移',
      show: !isWholeTable.value && isCol.value,
      command: addColBeforeCommand,
    },
    {
      icon: DeleteOutlined,
      tooltip: '删除',
      show: isWholeTable.value || (!isHeading.value && isAny.value),
      command: deleteSelectedCellsCommand,
    },
    {
      icon: ArrowRightOutlined,
      tooltip: '右移',
      show: !isWholeTable.value && isCol.value,
      command: addColAfterCommand,
    },
    {
      icon: ArrowDownOutlined,
      tooltip: '下移',
      show: !isWholeTable.value && isRow.value,
      command: addRowAfterCommand,
    },
    {
      icon: AlignLeftOutlined,
      tooltip: '左对齐',
      show: !isWholeTable.value && isCol.value,
      command: setAlignCommand,
      payload: 'left',
    },
    {
      icon: AlignCenterOutlined,
      tooltip: '居中',
      show: !isWholeTable.value && isCol.value,
      command: setAlignCommand,
      payload: 'center',
    },
    {
      icon: AlignRightOutlined,
      tooltip: '右对齐',
      show: !isWholeTable.value && isCol.value,
      command: setAlignCommand,
      payload: 'right',
    },
  ]
})

function handleAction(command: $Command<any>, payload?: string) {
  if (loading.value)
    return
  getEditor()?.action((ctx) => {
    ctx.get?.(commandsCtx).call(command.key, payload)
  })
}
</script>
