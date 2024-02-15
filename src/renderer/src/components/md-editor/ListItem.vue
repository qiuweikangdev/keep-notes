<template>
  <li
    class="flex-column flex items-start gap-2"
    :class="{ ['ProseMirror-selectednode']: selected }"
  >
    <span className="flex h-6 items-center">
      <template v-if="checked != null">
        <input
          className="form-checkbox rounded"
          type="checkbox"
          :checked="checked"
          @change="onChange"
        />
      </template>
      <template v-else-if="isBullet">
        <span className="h-2 w-2 rounded-full bg-nord8 dark:bg-nord9" />
      </template>
      <template v-else>
        <span className="text-nord8">{{ attrs?.label }}</span>
      </template>
    </span>
    <div className="min-w-0" ref="contentRef" />
  </li>
</template>
<script setup lang="ts">
import { useNodeViewContext } from '@prosemirror-adapter/vue'
const { contentRef, node, setAttrs, selected } = useNodeViewContext()
const { attrs } = node.value
const checked = attrs?.checked
const isBullet = attrs?.listType === 'bullet'

const onChange = () => {
  setAttrs({ checked: !checked })
}
</script>
