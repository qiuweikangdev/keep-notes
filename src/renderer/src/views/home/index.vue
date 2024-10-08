<template>
  <div :class="themeClass" class="h-full flex flex-col overflow-hidden">
    <menu-bar @open-sync-settings="handleOpenSyncSettings" />
    <div class="flex flex-1">
      <splitpanes
        class="default-theme w-full"
        vertical
        @resize="handlePanelResize"
      >
        <pane
          ref="leftPanelSizeRef"
          :size="panelSize"
          class="min-w-[4px]"
          :style="leftPanelStyle"
        >
          <dir-tree :panel-width="panelSize" :panel-height="panelHeight" />
        </pane>
        <pane
          :size="100 - panelSize"
          class="outline-teal-600"
          :style="rightPanelStyle"
        >
          <div class="flex-1 h-full flex flex-col">
            <div class="md-wrapper flex-1">
              <milkdown-provider>
                <prosemirror-adapter-provider>
                  <milkdown
                    :panel-size="panelSize"
                    @toggle-collapse="handleToggleCollapse"
                  />
                </prosemirror-adapter-provider>
              </milkdown-provider>
            </div>
          </div>
        </pane>
      </splitpanes>
    </div>
    <sync-settings v-model:open="openSyncSettings" />
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import { Pane, Splitpanes } from 'splitpanes'
import DirTree from '@renderer/components/dir-tree/index.vue'
import useTheme from '@renderer/hooks/useTheme'
import Milkdown from '@renderer/components/md-editor/index.vue'
import MenuBar from '@renderer/components/menu-bar/index.vue'
import panelConfig from '@renderer/config/panel'
import SyncSettings from '@renderer/components/sync-settings/index.vue'

const { themeClass } = useTheme()

const panelSize = ref<number>(panelConfig.leftPanelSize)
const leftPanelSizeRef = ref()
const leftWidth = ref<number>(0)
const leftPanelStyle = ref<CSSProperties>({})
const rightPanelStyle = ref<CSSProperties>({})
const panelHeight = ref<number>(window.innerHeight - 40)
const openSyncSettings = ref(false)

let preLeftPanelSize = 0

function handleToggleCollapse(collapsed) {
  if (collapsed) {
    preLeftPanelSize = panelSize.value
    panelSize.value = 0
  }
  else {
    panelSize.value
      = preLeftPanelSize <= 10 ? panelConfig.leftPanelSize : preLeftPanelSize
  }
  leftPanelStyle.value = { transition: 'width .2s ease-out' }
  rightPanelStyle.value = { transition: 'width .2s ease-out' }
}

function handlePanelResize(value: { size: number }[]) {
  const [minValue] = value
  leftPanelStyle.value = { width: `${minValue.size}%` }
  rightPanelStyle.value = {}
  panelSize.value = minValue.size
  getPanelWidth()
}

async function getPanelWidth() {
  await nextTick()
  leftPanelStyle.value = { width: `${leftPanelSizeRef.value.$el.style.width}` }
  leftWidth.value = leftPanelSizeRef.value.$el.clientWidth
}

function handleWinResize() {
  if (leftPanelSizeRef.value?.$el) {
    const leftWidth = leftPanelSizeRef.value.$el.clientWidth
    rightPanelStyle.value = {
      width: `${window.innerWidth - leftWidth}px`,
    }
    leftPanelStyle.value.width = `${leftWidth}px`
  }
  panelHeight.value = window.innerHeight - 40
}

function handleOpenSyncSettings() {
  openSyncSettings.value = true
}

onMounted(() => {
  getPanelWidth()
  window.addEventListener('resize', handleWinResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWinResize)
})
</script>
