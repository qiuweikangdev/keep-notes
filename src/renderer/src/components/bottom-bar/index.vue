<template>
  <div class="py-[6px] bg-[#f8fafc] flex justify-between items-center">
    <a-button
      size="small"
      class="bg-none border-none"
      @click="handleToggleCollapse"
    >
      <menu-unfold-outlined v-if="collapsed" class="text-[18px]" />
      <menu-fold-outlined v-else class="text-[18px]" />
    </a-button>
    <div class="text-right mx-[8px]">
      <span class="text-gray-600 bg-slate-300 p-[4px] rounded-lg text-[12px]">
        {{ size }} 词
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue'

withDefaults(defineProps<BottomBarType>(), {})

const emits = defineEmits(['toggleCollapse'])

const collapsed = ref(false)

interface BottomBarType {
  size?: number
}

function handleToggleCollapse() {
  collapsed.value = !collapsed.value
  emits('toggleCollapse')
}
</script>
