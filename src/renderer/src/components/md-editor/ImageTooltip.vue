<template>
  <div class="hidden">
    <div
      ref="tooltipRef"
      class="flex w-96 flex-col gap-2 rounded border-gray-300 bg-white p-4 shadow ring dark:border-gray-600 dark:bg-black"
    >
      <label class="flex flex-row items-center justify-center gap-4">
        <span class="w-10">Link</span>
        <input>
      </label>
      <label class="flex flex-row items-center justify-center gap-4">
        <span class="w-10">Alt</span>
        <input>
      </label>
      <label class="flex flex-row items-center justify-center gap-4">
        <span class="w-10">Title</span>
        <input>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { TooltipProvider } from '@milkdown/plugin-tooltip'
import { NodeSelection } from '@milkdown/prose/state'
import { useInstance } from '@milkdown/vue'

const tooltipRef = ref<HTMLDivElement>()

const tooltipProvider = ref<TooltipProvider>()
const [loading] = useInstance()

onMounted(() => {
  if (tooltipRef.value && !tooltipProvider.value && !loading) {
    const provider = new TooltipProvider({
      content: tooltipRef.value,
      tippyOptions: {
        zIndex: 30,
        appendTo: document.body,
      },
      shouldShow: (view) => {
        const { selection } = view.state
        const { empty, from } = selection

        const isTooltipChildren = provider.element.contains(
          document.activeElement,
        )

        const notHasFocus = !view.hasFocus() && !isTooltipChildren

        const isReadonly = !view.editable

        if (notHasFocus || empty || isReadonly) {
          return false
        }

        return (
          selection instanceof NodeSelection
          && view.state.doc.nodeAt(from)?.type.name === 'image'
        )
      },
    })

    tooltipProvider.value = provider
  }
})

onBeforeUnmount(() => {
  tooltipProvider.value?.destroy()
})
</script>
