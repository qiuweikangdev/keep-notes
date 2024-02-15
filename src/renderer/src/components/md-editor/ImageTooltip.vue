<template>
  <div class="hidden">
    <div
      ref="tooltipRef"
      class="flex w-96 flex-col gap-2 rounded border-gray-300 bg-white p-4 shadow ring dark:border-gray-600 dark:bg-black"
    >
      <label class="flex flex-row items-center justify-center gap-4">
        <span class="w-10">Link</span>
        <input />
      </label>
      <label class="flex flex-row items-center justify-center gap-4">
        <span class="w-10">Alt</span>
        <input />
      </label>
      <label class="flex flex-row items-center justify-center gap-4">
        <span class="w-10">Title</span>
        <input />
      </label>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { commandsCtx } from '@milkdown/core'
import { tooltipFactory, TooltipProvider } from '@milkdown/plugin-tooltip'
import { updateImageCommand } from '@milkdown/preset-commonmark'
import { NodeSelection } from '@milkdown/prose/state'
import { useInstance } from '@milkdown/vue'
import { usePluginViewContext } from '@prosemirror-adapter/vue'

const tooltipRef = ref<HTMLDivElement>()

const { view, prevState } = usePluginViewContext()
const tooltipProvider = ref<TooltipProvider>()
console.log('view', view)
const { state } = view.value
const { selection } = state
const imageNode = state.doc.nodeAt(selection.from)
const [loading, getEditor] = useInstance()
const { src, alt, title } = imageNode?.attrs ?? {}

onMounted(() => {
  if (tooltipRef.value && !tooltipProvider.value && !loading) {
    const provider = new TooltipProvider({
      content: tooltipRef.value,
      tippyOptions: {
        zIndex: 30,
        appendTo: document.body
      },
      shouldShow: (view) => {
        const { selection } = view.state
        const { empty, from } = selection

        const isTooltipChildren = provider.element.contains(document.activeElement)

        const notHasFocus = !view.hasFocus() && !isTooltipChildren

        const isReadonly = !view.editable

        if (notHasFocus || empty || isReadonly) {
          return false
        }

        return (
          selection instanceof NodeSelection && view.state.doc.nodeAt(from)?.type.name === 'image'
        )
      }
    })

    tooltipProvider.value = provider
  }
})

onBeforeUnmount(() => {
  tooltipProvider.value?.destroy()
})
</script>
