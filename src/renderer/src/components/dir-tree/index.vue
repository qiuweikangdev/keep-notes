<template>
  <div ref="containerRef" class="tree-wrapper h-full w-full">
    <template v-if="treeData?.length">
      <a-directory-tree
        v-model:expandedKeys="expandedKeys"
        v-model:selectedKeys="selectedKeys"
        :height="panelHeight - 10"
        :tree-data="treeData"
        block-node
        class="min-w-[50px] h-full bg-color-action-bar dark:bg-dark-color-action-bar"
        @select="handleSelect"
      >
        <template #title="{ title, key }">
          <a-dropdown :trigger="['contextmenu']">
            <span class="pl-[6px]">{{ title }}</span>
            <template #overlay>
              <a-menu
                @click="
                  ({ key: menuKey }) => handleContextMenuClick(key, menuKey)
                "
              >
                <a-menu-item v-for="item in contextMenuList" :key="item.key">
                  {{ item.title }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
        <template #icon="{ title }">
          <file-text-filled
            v-if="title.endsWith('md')"
            class="text-slate-400"
          />
          <folder-filled v-else class="text-slate-500" />
        </template>
      </a-directory-tree>
    </template>
    <template v-else>
      <upload v-show="panelWidth > 2" @success="handleUploadSuccess" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, toRaw } from 'vue'
import { FileTextFilled, FolderFilled } from '@ant-design/icons-vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import { useStore } from '@renderer/store/index'
import useTreeAction from '@renderer/hooks/useTreeAction'
import Upload from './components/upload.vue'

withDefaults(defineProps<{ panelWidth?: number, panelHeight?: number }>(), {
  panelWidth: panelConfig.leftPanelSize,
  panelHeight: window.innerHeight,
})

const { contextMenuList, createFile } = useTreeAction()

const containerRef = ref(HTMLElement)
const expandedKeys = ref<string[]>()
const selectedKeys = ref<string[]>([])

const { setContent, setContentFilePath } = useContent()
const { treeData, setTreeData } = useStore()
function handleUploadSuccess(data) {
  setTreeData(data)
}

async function handleSelect(_, info) {
  const { node } = info
  const { fileName, filePath, sysPath } = node || {}
  if (fileName.endsWith('md')) {
    const realPath = sysPath ?? filePath
    const content = await window.api.readFileContent(realPath)
    setContent(content)
    setContentFilePath(realPath)
  }
}

function handleContextMenuClick(nodeKey: string, menuKey: string | number) {
  const actionMap = {
    createFile: () => createFile(nodeKey, '新建文件', toRaw(treeData.value)),
  }
  actionMap[menuKey]()
}
</script>

<style lang="less" scoped>
.tree-wrapper {
  :deep(.ant-tree .ant-tree-list),
  :deep(.ant-tree .ant-tree-list-holder) {
    height: 100%;
  }
  :deep(.ant-tree ::-webkit-scrollbar-thumb) {
    display: none;
  }
  :deep(.ant-tree:hover ::-webkit-scrollbar-thumb) {
    display: block;
  }
}
</style>
