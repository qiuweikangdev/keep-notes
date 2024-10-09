<template>
  <div>
    <a-form
      class="p-[20px]"
      :model="formData"
      :label-col="{ style: { width: '100px', textAlign: 'left' } }"
    >
      <a-form-item label="目录图标颜色" name="iconColor">
        <a-radio-group
          v-model:value="formData.iconColor"
          :options="iconColorOptions"
        />
      </a-form-item>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

const formData = reactive({ iconColor: 1 })

const iconColorOptions = [
  { label: '色彩图标', value: 1 },
  { label: '跟随主题', value: 2 },
]
</script>

<style scoped></style>
