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
import panelConfig from '@renderer/config/panel'

interface BottomBarType {
  total?: number
  panelSize?: number
}

const props = withDefaults(defineProps<BottomBarType>(), {
  total: 0,
})

const emits = defineEmits(['toggleCollapse', 'update:collapsed'])

const { themeClass } = useTheme()

const collapsed = ref(false)

function handleToggleCollapse() {
  collapsed.value = !collapsed.value
  emits('toggleCollapse', collapsed.value)
}

watch(
  () => props.panelSize,
  (value = panelConfig.leftPanelSize) => {
    collapsed.value = !!(value === 0 || value <= 10)
  },
)
</script>
