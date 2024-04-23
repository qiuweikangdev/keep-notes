<template>
  <div
    class="bg-color-action-bar dark:bg-dark-color-action-bar upload-wrapper w-full h-full cursor-pointer"
    @click="handleOpenDialog"
  >
    <spinner :loading="loading" class="h-full flex justify-center items-center">
      <plus-outlined
        class="text-[24px] text-color-icon dark:text-dark-color-icon"
      />
    </spinner>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import Spinner from '@renderer/components/spinner/index.vue'
import { CodeResult } from '@common/types/enum'

const emits = defineEmits(['success'])

const loading = ref<boolean>(false)

async function handleOpenDialog() {
  if (!loading.value) {
    loading.value = true
    const { code, data } = await window.api.openDialog()
    if (code === CodeResult.Success) {
      const { treeData, treeRoot } = data
      emits('success', { treeData, treeRoot })
    }
    loading.value = false
  }
}
</script>
