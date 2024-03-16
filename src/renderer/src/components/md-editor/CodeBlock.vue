<template>
  <div
    class="not-prose my-4 rounded bg-gray-100 p-5 shadow dark:bg-dark-color-action-bar"
    @mouseenter="showCopy = true"
    @mouseleave="showCopy = false"
  >
    <div
      contentEditable="false"
      suppressContentEditableWarning
      class="mb-2 flex justify-between"
    >
      <a-select
        v-model:value="codeType"
        style="width: 120px"
        @change="handleChange"
      >
        <a-select-option v-for="lang in langs" :key="lang" :value="lang">
          {{ lang }}
        </a-select-option>
      </a-select>

      <a-button
        v-if="showCopy"
        :icon="h(CopyOutlined)"
        class="!px-[2px] !pt-[0px]"
        @click="handleCopy"
      />
    </div>
    <pre :spellCheck="false" class="!m-0 !mb-4">
        <code :ref="contentRef" />
      </pre>
  </div>
</template>

<script setup lang="ts">
import { CopyOutlined } from '@ant-design/icons-vue'
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import { h, ref } from 'vue'

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

const { contentRef, node, setAttrs } = useNodeViewContext()

const codeType = ref(node.value.attrs.language || 'text')
const showCopy = ref(false)

function handleChange(value) {
  codeType.value = value
  setAttrs({ language: value })
}

function handleCopy(e) {
  e.preventDefault()
  navigator.clipboard.writeText(node.value.textContent)
}
</script>
