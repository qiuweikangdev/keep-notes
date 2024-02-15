<template>
  <div class="table-tooltip hidden">
    <div
      ref="tableTooltipRef"
      class="inline-flex justify-center items-center border-y-2 border-[#e5e7eb] border-solid"
    >
      <tooltip-icon></tooltip-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, FunctionalComponent, onMounted } from 'vue'
import { ArrowLeftOutlined, ArrowRightOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { AntdIconProps } from '@ant-design/icons-vue/lib/components/AntdIcon'
import type { CmdKey } from '@milkdown/core'
import { useInstance } from '@milkdown/vue'
import { usePluginViewContext } from '@prosemirror-adapter/vue'
import { commandsCtx } from '@milkdown/core'
import { addColAfterCommand, addColBeforeCommand } from '@milkdown/preset-gfm'
import { TooltipProvider } from '@milkdown/plugin-tooltip'
import { CellSelection } from '@milkdown/prose/tables'
import { tableTooltipCtx } from './plugins/index'
import TooltipIcon from './tooltip-icon.vue'

type TableTooltipType = {
  icon: FunctionalComponent<AntdIconProps>
  tooltip: String
  command: () => CmdKey<any>
}

const tableTooltip: TableTooltipType[] = [
  {
    icon: ArrowLeftOutlined,
    tooltip: '当前列前添加列',
    command: () => addColBeforeCommand.key
  },
  {
    icon: DeleteOutlined,
    tooltip: '删除列',
    command: () => addColBeforeCommand.key
  },
  {
    icon: ArrowRightOutlined,
    tooltip: '当前列后添加列',
    command: () => addColAfterCommand.key
  }
]

const tableTooltipRef = ref<HTMLElement>()
const { view } = usePluginViewContext()
const tooltipProviderRef = ref<TooltipProvider>()
const [loading, getEditor] = useInstance()

const isRow = computed(
  () =>
    view.value.state.selection instanceof CellSelection &&
    view.value.state.selection.isRowSelection()
)
const isCol = computed(
  () =>
    view.value.state.selection instanceof CellSelection &&
    view.value.state.selection.isColSelection()
)
const isWholeTable = computed(() => isRow.value && isCol.value)
const isAny = computed(() => isRow.value || isCol.value)
const isHeading = computed(
  () =>
    isRow.value &&
    view.value.state.doc.nodeAt((view.value.state.selection as CellSelection).$headCell.pos)?.type
      .name === 'table_header'
)

onMounted(() => {
  if (tableTooltipRef.value) {
    const provider = new TooltipProvider({
      content: tableTooltipRef.value,
      tippyOptions: {
        zIndex: 30
      },
      shouldShow: () => {
        return false
      }
    })
    provider.update(view.value)
    getEditor()?.action((ctx) => {
      ctx?.set(tableTooltipCtx.key, provider)
      tooltipProviderRef.value = provider
    })
  }
})

onBeforeUnmount(() => {
  tooltipProviderRef.value?.destroy()
})

const handleAction = (command: () => CmdKey<any>) => {
  if (command()) {
    getEditor()?.action((ctx) => {
      ctx.get(commandsCtx).call(command())
    })
  }
}
</script>
