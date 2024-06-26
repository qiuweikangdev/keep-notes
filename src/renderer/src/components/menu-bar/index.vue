<template>
  <div class="menu-bar flex items-center justify-end">
    <div class="config-menu mx-[12px] flex items-center">
      <a-tooltip
        v-for="(item, index) in configMenu"
        :key="index"
        placement="bottom"
        class="px-[12px] hover:bg-color-icon dark:hover:bg-dark-color-hover mx-[8px] outline-none rounded-full"
      >
        <component
          :is="item.icon"
          class="text-[#8e8e94] py-[10px] hover:font-bold hover:text-color-primary-hover text-[16px] cursor-pointer"
          @click="item.handle"
        />
      </a-tooltip>
    </div>

    <span
      class="mx-[12px] w-[1px] h-[16px] bg-color-secondary dark:bg-dark-color-secondary"
    />

    <div class="win-menu">
      <a-tooltip
        v-for="(item, index) in winMenu"
        :key="index"
        placement="bottom"
        class="px-[12px] hover:bg-color-icon dark:hover:bg-dark-color-hover mx-[8px]"
      >
        <component
          :is="item.icon"
          class="text-[#8e8e94] py-[12px] hover:font-bold hover:text-color-primary-hover text-[12px]"
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
  GithubFilled,
  MinusOutlined,
} from '@ant-design/icons-vue'
import LightSvg from '@renderer/icons/light.svg'
import DarkSvg from '@renderer/icons/dark.svg'
import type { MenuActionOptions } from '@common/types/menu'
import { computed, ref } from 'vue'
import useTheme from '@renderer/hooks/useTheme'

const emits = defineEmits(['openSyncSettings'])

const isMaximize = ref(false)

const { theme, changeTheme } = useTheme()

const configMenu = computed(
  () =>
    [
      {
        icon: GithubFilled,
        handle: () => {
          emits('openSyncSettings')
        },
      },
      {
        icon: theme.value === 'light' ? LightSvg : DarkSvg,
        handle: (e: MouseEvent) => {
          changeTheme(e, theme.value === 'light' ? 'dark' : 'light')
        },
      },
    ] as MenuActionOptions[],
)

const winMenu = computed(
  () =>
    [
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
    ] as MenuActionOptions[],
)
</script>
