<template>
  <li
    class="flex-column flex items-start gap-2"
    :class="{ ['ProseMirror-selectednode']: selected }"
  >
    <span class="flex h-6 items-center">
      <template v-if="checked != null">
        <input
          class="form-checkbox rounded"
          type="checkbox"
          :checked="checked"
          @change="onChange"
        >
      </template>
      <template v-else-if="isBullet">
        <span class="h-2 w-2 rounded-full bg-nord8 dark:bg-nord9" />
      </template>
      <template v-else>
        <span class="text-nord8">{{ attrs?.label }}</span>
      </template>
    </span>
    <div ref="contentRef" class="min-w-0" />
  </li>
</template>

<script setup lang="ts">
import { useNodeViewContext } from '@prosemirror-adapter/vue'

const { contentRef, node, setAttrs, selected } = useNodeViewContext()
const { attrs } = node.value
const checked = attrs?.checked
const isBullet = attrs?.listType === 'bullet'

function onChange() {
  setAttrs({ checked: !checked })
}
</script>
