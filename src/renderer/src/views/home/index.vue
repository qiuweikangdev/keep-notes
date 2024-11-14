<template>
  <div :class="themeClass" class="h-full flex flex-col overflow-hidden">
    <menu-bar @open-settings="handleSettings" />
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
          <left-area />
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
    <settings-modal v-model:open="settingsModalVisible" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import { Pane, Splitpanes } from 'splitpanes'
import useTheme from '@renderer/hooks/useTheme'
import Milkdown from '@renderer/components/md-editor/index.vue'
import MenuBar from '@renderer/components/menu-bar/index.vue'
import SettingsModal from '@renderer/components/settings-modal/index.vue'
import LeftArea from '@renderer/components/left-area/index.vue'
import { ProvideStateEnum } from '@common/types/enum'
import type { PanelConfig } from './hooks/useHome'
import useHome from './hooks/useHome'

const { themeClass } = useTheme()

const {
  panelSize,
  leftPanelSizeRef,
  leftPanelStyle,
  rightPanelStyle,
  panelHeight,
  settingsModalVisible,
  handleToggleCollapse,
  handlePanelResize,
  handleWinResize,
  handleSettings,
  getPanelWidth,
} = useHome()

onMounted(() => {
  getPanelWidth()
  window.addEventListener('resize', handleWinResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWinResize)
})

provide<PanelConfig>(ProvideStateEnum.PanelConfig, {
  panelHeight,
  panelSize,
})
</script>
