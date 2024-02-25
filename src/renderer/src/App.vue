<template>
  <a-config-provider :theme="themeConfig">
    <div :class="themeClass" class="h-full flex flex-col">
      <menu-bar />
      <div class="flex flex-1">
        <splitpanes class="default-theme" vertical>
          <pane :size="paneSize">
            <div class="min-w-[250px] h-full">
              <dir-tree />
            </div>
          </pane>
          <pane :size="100 - paneSize">
            <div class="flex-1 h-full flex flex-col">
              <div class="md-wrapper flex-1">
                <milkdown-provider>
                  <prosemirror-adapter-provider>
                    <milkdown @toggle-collapse="handleToggleCollapse" />
                    <bottom-bar />
                  </prosemirror-adapter-provider>
                </milkdown-provider>
              </div>
            </div>
          </pane>
        </splitpanes>
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DirTree from '@renderer/components/dir-tree/index.vue'
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import { Pane, Splitpanes } from 'splitpanes'
import BottomBar from '@renderer/components/bottom-bar/index.vue'
import useTheme from '@renderer/hooks/useTheme'
import Milkdown from './components/md-editor/index.vue'
import MenuBar from './components/menu-bar/index.vue'

const { themeConfig, themeClass } = useTheme()

const paneSize = ref(30)

function handleToggleCollapse() {
  if (paneSize.value === 0)
    paneSize.value = 30
  else paneSize.value = 0
}
</script>
