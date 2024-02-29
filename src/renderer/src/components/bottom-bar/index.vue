<template>
  <div
    :class="themeClass"
    class="py-[6px] flex justify-between items-center transition-none"
  >
    <a-button
      size="small"
      class="bg-none border-none"
      @click="handleToggleCollapse"
    >
      <menu-unfold-outlined v-if="collapsed" class="text-[18px]" />
      <menu-fold-outlined v-else class="text-[18px]" />
    </a-button>
    <div className="text-right mx-[8px]">
      <span
        className="text-gray-600 bg-slate-300 p-[4px] rounded-lg text-[12px]"
      >
        {{ total }} 词
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue'
import useTheme from '@renderer/hooks/useTheme'

interface BottomBarType {
  total?: number
  panelSize?: number
  collapsed: boolean
}

const props = withDefaults(defineProps<BottomBarType>(), {
  collapsed: false,
})

const emits = defineEmits(['toggleCollapse', 'update:collapsed'])

const { themeClass } = useTheme()

const collapsed = ref(false)

function handleToggleCollapse() {
  collapsed.value = !collapsed.value
  emits('toggleCollapse')
  emits('update:collapsed', !props.collapsed)
}

watch(
  () => props.panelSize,
  (value) => {
    collapsed.value = !!(value === 0)
  },
)
</script>
