<template>
  <div :class="themeClass" class="h-full flex flex-col">
    <menu-bar />
    <div class="flex flex-1">
      <splitpanes class="default-theme" vertical @resize="handleResize">
        <pane :size="panelSize" min-size="1">
          <div class="min-w-[250px] h-full">
            <dir-tree />
          </div>
        </pane>
        <pane :size="100 - panelSize">
          <div class="flex-1 h-full flex flex-col">
            <div class="md-wrapper flex-1">
              <milkdown-provider>
                <prosemirror-adapter-provider>
                  <milkdown
                    :panel-size="leftPanelSize"
                    @toggle-collapse="handleToggleCollapse"
                  />
                </prosemirror-adapter-provider>
              </milkdown-provider>
            </div>
          </div>
        </pane>
      </splitpanes>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import { Pane, Splitpanes } from 'splitpanes'
import DirTree from '@renderer/components/dir-tree/index.vue'
import useTheme from '@renderer/hooks/useTheme'
import Milkdown from '@renderer/components/md-editor/index.vue'
import MenuBar from '@renderer/components/menu-bar/index.vue'

const { themeClass } = useTheme()

const panelSize = ref(30)
const leftPanelSize = ref(30)

function handleToggleCollapse() {
  panelSize.value = leftPanelSize.value <= 1 ? 30 : 1
  leftPanelSize.value = panelSize.value
}

function handleResize(value) {
  const [minValue] = value
  leftPanelSize.value = minValue.size
  panelSize.value = minValue.size
}
</script>
