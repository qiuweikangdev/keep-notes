<template>
  <div
    :class="selected ? 'ProseMirror-selectednode' : ''"
    class="not-prose my-4 rounded bg-gray-200 p-5 shadow dark:bg-gray-800"
  >
    <div
      contentEditable="false"
      suppressContentEditableWarning
      class="mb-2 flex justify-between"
    >
      <select
        class="!focus:shadow-none cursor-pointer rounded !border-0 bg-white shadow-sm focus:ring-2 focus:ring-offset-2 dark:bg-black"
        :value="node.attrs.language || 'text'"
        @change="onChange"
      >
        <option v-for="lang in langs" :key="lang" :value="lang">
          {{ lang }}
        </option>
      </select>

      <button
        class="inline-flex items-center justify-center rounded border border-gray-200 bg-white px-4 py-2 text-base font-medium leading-6 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-offset-2 dark:bg-black"
        @click="handleBtn"
      >
        Copy
      </button>
    </div>
    <pre :spellCheck="false" class="!m-0 !mb-4">
        <code :ref="contentRef" />
      </pre>
  </div>
</template>

<script setup lang="ts">
import { useNodeViewContext } from '@prosemirror-adapter/vue'

const langs = [
  'text',
  'ts',
  'js',
  'vue',
  'react',
  'bash',
  'html',
  'css',
  'json',
]

const { contentRef, selected, node, setAttrs } = useNodeViewContext()

function onChange(e) {
  setAttrs({ language: e.target.value })
}

function handleBtn(e) {
  e.preventDefault()
  navigator.clipboard.writeText(node.textContent)
}
</script>
