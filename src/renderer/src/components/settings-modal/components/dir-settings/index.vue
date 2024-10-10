<template>
  <div>
    <a-form
      class="p-[20px]"
      :model="dirSettings"
      :label-col="{ style: { width: '120px', textAlign: 'left' } }"
    >
      <a-form-item label="目录图标颜色" name="dirColor">
        <a-radio-group
          v-model:value="dirSettings.dirColor"
          :options="iconColorOptions"
        />
      </a-form-item>
      <a-form-item label="展示目录图标" name="showIcon">
        <a-radio-group
          v-model:value="dirSettings.showIcon"
          :options="showOptions"
        />
      </a-form-item>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { DirColorEnum, useTreeStore } from '@renderer/store/modules/tree'
import { storeToRefs } from 'pinia'

const treeStore = useTreeStore()
const { dirSettings } = storeToRefs(treeStore)

const iconColorOptions = [
  { label: '色彩图标', value: DirColorEnum.MultiColor },
  { label: '跟随主题', value: DirColorEnum.ThemeColor },
]

const showOptions = [
  { label: '是', value: true },
  { label: '否', value: false },
]
</script>

<style scoped></style>
