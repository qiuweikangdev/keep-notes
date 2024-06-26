<template>
  <div ref="containerRef" class="relative tree-wrapper h-full w-full">
    <template v-if="treeRoot.key">
      <div
        class="flex w-full absolute top-[6px] left-[4px] whitespace-nowrap px-[12px] my-[px] dark:text-color-primary"
      >
        <folder-open-filled
          class="text-slate-500 dark:text-slate-400 text-[18px]"
        />
        <context-menu
          is-root-node
          :title="treeRoot.title"
          :node-key="treeRoot.key"
          @menu="handleContextMenuClick"
        />
      </div>
      <a-directory-tree
        v-model:selectedKeys="selectedKeys"
        :height="panelHeight - 10 - 34"
        :tree-data="treeData"
        block-node
        class="pt-[42px] min-w-[50px] h-full bg-color-action-bar dark:bg-dark-color-action-bar"
        @select="handleSelect"
        @expand="handleExpand"
      >
        <template #title="{ title, key }">
          <context-menu
            :title="title"
            :node-key="key"
            @menu="handleContextMenuClick"
          />
        </template>
        <template #icon="{ title, color }">
          <file-text-filled
            v-if="title.endsWith('md')"
            class="text-[18px]"
            :style="{ color: colorMd }"
          />
          <folder-filled
            v-else
            class="text-slate-500 text-[18px]"
            :style="{ color }"
          />
        </template>
      </a-directory-tree>
    </template>
    <template v-else>
      <upload v-show="panelWidth > 2" @success="handleUploadSuccess" />
    </template>
    <modal
      v-model:open="modalInfo.open"
      :title="modalInfo.title"
      :type="modalInfo.type"
      @ok="handleModalOk"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, toRaw } from 'vue'
import {
  FileTextFilled,
  FolderFilled,
  FolderOpenFilled,
} from '@ant-design/icons-vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import { useStore } from '@renderer/store/index'
import useTreeAction, { ContextMenuKey } from '@renderer/hooks/useTreeAction'
import { colorMd } from '@common/utils/color'
import Upload from './components/upload.vue'
import Modal from './components/modal.vue'
import ContextMenu from './components/contextMenu.vue'

withDefaults(defineProps<{ panelWidth?: number, panelHeight?: number }>(), {
  panelWidth: panelConfig.leftPanelSize,
  panelHeight: window.innerHeight,
})
const { treeData, setTreeInfo, treeRoot } = useStore()

const containerRef = ref(HTMLElement)
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const modalInfo = reactive<{
  open: boolean
  title: string
  type: ContextMenuKey
  nodeKey: string
}>({ open: false, title: '', type: ContextMenuKey.CreateFile, nodeKey: '' })

const { createFile, createFolder, rename, deleteFileOrFolder }
  = useTreeAction()

const { setContent, setContentFilePath } = useContent()

function handleUploadSuccess({ treeData, treeRoot }) {
  setTreeInfo({
    treeData,
    treeRoot,
  })
}

async function handleSelect(_, info) {
  const { node } = info
  const { title: fileName, sysPath, key: filePath } = node || {}
  if (fileName.endsWith('md')) {
    const realPath = sysPath ?? filePath
    const content = await window.api.readFileContent(realPath)
    setContent(content)
    setContentFilePath(realPath)
  }
}

async function handleContextMenuClick({
  nodeKey,
  nodeTitle,
  menuKey,
  menuTitle,
}) {
  if (menuKey === ContextMenuKey.Delete) {
    await deleteFileOrFolder(nodeKey, nodeTitle, toRaw(treeData.value))
  }
  else {
    Object.assign(modalInfo, {
      open: true,
      title: menuTitle,
      type: menuKey,
      nodeKey,
    })
  }
}

function handleExpand(keys) {
  expandedKeys.value = keys
}

async function handleModalOk(value) {
  const actionMap = {
    createFile,
    createFolder,
    rename,
  }
  const actionFunction = actionMap[modalInfo.type]
  if (actionFunction) {
    await actionFunction(modalInfo.nodeKey, value, toRaw(treeData.value))
    modalInfo.open = false
  }
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
