<template>
  <a-modal v-model:open="open" :title="title" width="300px" destroy-on-close>
    <template
      v-if="
        [
          ContextMenuKey.CreateFile,
          ContextMenuKey.CreateFolder,
          ContextMenuKey.Rename,
        ].includes(type)
      "
    >
      <a-input v-model:value="name" class="dark:bg-transparent" allow-clear />
    </template>
    <template #footer>
      <div class="flex justify-end">
        <a-button
          :disabled="!name"
          :icon="h(CheckOutlined)"
          class="text-color-primary-hover border-color-primary-hover/35 flex items-center"
          @click="handleOk"
        >
          确定
        </a-button>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue'
import { ContextMenuKey } from '@renderer/hooks/useTreeAction'
import { h, ref } from 'vue'

withDefaults(
  defineProps<{
    type: ContextMenuKey
    title?: string
  }>(),
  {},
)

const emits = defineEmits(['ok'])

const open = defineModel('open', { type: Boolean, default: false })

const name = ref('')

function handleOk() {
  emits('ok', name.value)
}
</script>
