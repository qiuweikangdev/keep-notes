<template>
  <div class="flex items-center justify-between">
    <div class="right-menu">
      <a-tooltip
        v-for="(item, index) in rightMenu"
        :key="index"
        :title="item.tooltip"
        placement="bottom"
        class="px-[12px] hover:bg-[#f2f2f2] mx-[8px]"
      >
        <component
          :is="item.icon"
          class="text-[#8e8e94] py-[12px] hover:font-bold hover:text-[#c0835d] text-[22px]"
          @click="item.handle"
        />
      </a-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CloseOutlined,
  ExpandOutlined,
  MinusOutlined,
} from '@ant-design/icons-vue'
import type { MenuActionOptions } from '@common/types/menu'
import { ref } from 'vue'

const isMaximize = ref(false)

const rightMenu: MenuActionOptions[] = [
  {
    icon: MinusOutlined,
    tooltip: '最小化',
    command: 'minimize',
    handle: () => window.api.onWinMinimize(),
  },
  {
    icon: ExpandOutlined,
    tooltip: '最大化',
    command: 'maximize',
    handle: () => {
      isMaximize.value = !isMaximize.value
      window.api.onWinMaximize()
    },
  },
  {
    icon: CloseOutlined,
    tooltip: '关闭',
    command: 'close',
    handle: () => window.api.onWinClose(),
  },
]
</script>
