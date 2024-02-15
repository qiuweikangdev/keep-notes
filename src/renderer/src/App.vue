<template>
  <a-config-provider
    :theme="{
      token: {
        colorBgContainer: themeConfig.colorBgContainer,
        colorPrimary: themeConfig.colorPrimary,
        colorTextLightSolid: themeConfig.colorText,
        colorPrimaryHover: themeConfig.colorPrimaryHover
      },
      components: {
        Tooltip: {
          colorTextLightSolid: themeConfig.tooltipColorText
        }
      }
    }"
  >
    <div class="h-full flex">
      <div class="min-w-[250px] bg-color-bg-container">
        <dir-tree></dir-tree>
      </div>

      <div class="flex-1 h-full flex flex-col">
        <div class="md-wrapper flex-1">
          <milkdown-provider>
            <prosemirror-adapter-provider>
              <milkdown />
            </prosemirror-adapter-provider>
          </milkdown-provider>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
<script setup lang="ts">
import { themeConfig } from '@renderer/config/theme'
import DirTree from '@renderer/components/dir-tree/index.vue'
import Milkdown from './components/md-editor/index.vue'
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
</script>
