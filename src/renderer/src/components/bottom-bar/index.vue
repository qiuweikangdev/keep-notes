<template>
  <div class="py-[6px] bg-[#f8fafc] flex justify-between items-center">
    <a-button size="small" class="bg-none border-none" @click="handleToggleCollapse">
      <menu-unfold-outlined v-if="collapsed" class="text-[18px]" />
      <menu-fold-outlined v-else class="text-[18px]" />
    </a-button>
    <div className="text-right mx-[8px]">
      <span className="text-gray-600 bg-slate-300 p-[4px] rounded-lg text-[12px]">
        {{ size }} 词
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue'

const collapsed = ref(false)

type BottomBarType = {
  size?: number
}

withDefaults(defineProps<BottomBarType>(), {})

const emits = defineEmits(['toggleCollapse'])

const handleToggleCollapse = () => {
  collapsed.value = !collapsed.value
  emits('toggleCollapse')
}
</script>
