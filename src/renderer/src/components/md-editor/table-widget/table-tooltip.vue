<template>
  <div class="table-tooltip hidden">
    <div
      ref="tableTooltipRef"
      class="inline-flex justify-center items-center border-y-2 border-[#e5e7eb] border-solid"
    >
      <tooltip-icon />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useInstance } from '@milkdown/vue'
import { usePluginViewContext } from '@prosemirror-adapter/vue'
import { TooltipProvider } from '@milkdown/plugin-tooltip'
import { tableTooltipCtx } from './plugins/index'
import TooltipIcon from './tooltip-icon.vue'

const tableTooltipRef = ref<HTMLElement>()
const { view } = usePluginViewContext()
const tooltipProviderRef = ref<TooltipProvider>()
const [_, getEditor] = useInstance()

onMounted(() => {
  if (tableTooltipRef.value) {
    const provider = new TooltipProvider({
      content: tableTooltipRef.value,
      tippyOptions: {
        zIndex: 30,
      },
      shouldShow: () => {
        return false
      },
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
</script>
