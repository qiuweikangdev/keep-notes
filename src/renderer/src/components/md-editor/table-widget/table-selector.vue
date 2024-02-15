<template>
  <div
    ref="tableSelectorRef"
    :draggable="type !== 'top-left'"
    :class="[getClassName, common]"
    @click="handleTableSelector"
    @dragstart="handleDragStart"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  ></div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWidgetViewContext } from '@prosemirror-adapter/vue'
import { useInstance } from '@milkdown/vue'
import { commandsCtx } from '@milkdown/core'
import {
  selectColCommand,
  selectRowCommand,
  selectTableCommand,
  setAlignCommand,
  moveColCommand,
  moveRowCommand
} from '@milkdown/preset-gfm'
import { tableTooltipCtx } from './plugins/index'

const { spec } = useWidgetViewContext()
const type = spec?.type
const index = spec?.index ?? 0
const [loading, getEditor] = useInstance()
const tableSelectorRef = ref<HTMLDivElement>()

const dragOver = ref(false)

const common = computed(() => {
  return [
    'hover:bg-color-primary hover:opacity-60 hover:dark:bg-[#e5e7eb] absolute cursor-pointer bg-gray-200 dark:bg-gray-600',
    dragOver.value ? 'ring-2' : ''
  ].join(',')
})

const getClassName = computed(() => {
  if (type === 'left') {
    return 'w-2 h-full -left-3.5 top-0'
  }
  if (type === 'top') {
    return 'right-px h-2 left-0 -top-3.5'
  }
  return 'h-3 w-3 -left-4 -top-4 rounded-full'
})

const handleTableSelector = (e) => {
  e.stopPropagation()
  const div = tableSelectorRef.value
  if (loading.value || !div) return
  getEditor()?.action((ctx) => {
    const tooltip = ctx.get(tableTooltipCtx.key)
    tooltip?.getInstance?.()?.setProps({
      getReferenceClientRect: () => {
        return div.getBoundingClientRect()
      }
    })
    tooltip?.show?.()
    const commands = ctx.get(commandsCtx)
    if (type === 'left') {
      commands.call(selectRowCommand.key, index)
    } else if (type === 'top') {
      commands.call(selectColCommand.key, index)
    } else {
      commands.call(selectTableCommand.key)
    }
  })
}

const handleDragStart = (e) => {
  e.stopPropagation()
  const data = { index: spec?.index, type: spec?.type }
  e.dataTransfer.setData('application/milkdown-table-sort', JSON.stringify(data))
  e.dataTransfer.effectAllowed = 'move'
}

const handleDragOver = (e) => {
  dragOver.value = true
  e.stopPropagation()
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

const handleDragLeave = () => {
  dragOver.value = false
}

const handleDrop = (e) => {
  dragOver.value = false
  if (type === 'top-left') return
  const i = spec?.index
  if (loading.value || i == null) return
  const data = e.dataTransfer.getData('application/milkdown-table-sort')
  try {
    const { index, type } = JSON.parse(data)
    getEditor()?.action((ctx) => {
      const commands = ctx.get(commandsCtx)
      const options = {
        from: Number(index),
        to: i
      }
      commands.call(type === 'left' ? moveRowCommand.key : moveColCommand.key, options)
    })
  } catch {
    // ignore data from other source
  }
}
</script>
