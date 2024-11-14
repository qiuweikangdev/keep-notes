<template>
  <div ref="containerRef" class="relative tree-wrapper h-full w-full">
    <div class="flex flex-col" :style="{ height: 'calc(100vh - 100px)' }">
      <template v-if="treeRoot.key">
        <div
          class="flex w-full absolute top-[6px] left-[4px] whitespace-nowrap px-[12px] my-[px] dark:text-color-primary"
        >
          <folder-open-filled
            v-if="dirSettings.showIcon"
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
          v-model:selected-keys="selectedKeys"
          :height="treeHeight"
          :tree-data="treeData"
          block-node
          draggable
          :show-icon="dirSettings.showIcon"
          class="pt-[42px] min-w-[50px] h-full bg-color-action-bar dark:bg-dark-color-action-bar"
          @select="handleSelect"
          @expand="handleExpand"
          @dragenter="handleDragEnter"
          @drop="handleDrop"
        >
          <template #title="{ title, key }">
            <context-menu
              :title="title"
              :node-key="key"
              @menu="handleContextMenuClick"
            />
          </template>
          <template #icon="{ title }">
            <file-text-filled
              v-if="title.endsWith('md')"
              class="text-[18px]"
              :style="{ color: colorMd }"
            />
            <folder-filled
              v-else
              class="text-slate-500 text-[18px]"
              :style="{ color: genDirColor(title) }"
            />
          </template>
        </a-directory-tree>
      </template>
      <template v-else>
        <upload v-show="panelWidth > 2" @success="handleUploadSuccess" />
      </template>
      <div
        v-if="treeRoot.key"
        class="inline-block b-t-1px b-solid text-color-icon dark:text-dark-color-icon cursor-pointer bg-color-container dark:bg-dark-color-container text-center absolute bottom-0 w-full h-[24px]"
        @click="handleSelectDir"
      >
        <plus-outlined />
      </div>
    </div>

    <modal
      v-model:open="modalInfo.open"
      :title="modalInfo.title"
      :type="modalInfo.type"
      @ok="handleModalOk"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref, toRaw } from 'vue'
import {
  FileTextFilled,
  FolderFilled,
  FolderOpenFilled,
  PlusOutlined,
} from '@ant-design/icons-vue'
import useContent from '@renderer/hooks/useContent'
import useTreeAction, { ContextMenuKey } from '@renderer/hooks/useTreeAction'
import { colorMd, genColor } from '@common/utils/color'
import { DirColorEnum, useTreeStore } from '@renderer/store/modules/tree'
import { useUserStore } from '@renderer/store/modules/user'
import { storeToRefs } from 'pinia'
import type { AntTreeNodeDropEvent } from 'ant-design-vue/es/tree'
import type { PanelConfig } from '@renderer/views/home/hooks/useHome'
import { ProvideStateEnum } from '@common/types/enum'
import Upload from './components/upload.vue'
import Modal from './components/modal.vue'
import ContextMenu from './components/contextMenu.vue'

const panelConfig = inject<PanelConfig>(ProvideStateEnum.PanelConfig)

const treeStore = useTreeStore()

const { setTreeInfo, updateTreeInfo } = useTreeStore()

const { treeData, treeRoot, dirSettings } = storeToRefs(treeStore)

const { setGithubInfo } = useUserStore()

const containerRef = ref(HTMLElement)
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const modalInfo = reactive<{
  open: boolean
  title: string
  type: ContextMenuKey
  nodeKey: string
}>({ open: false, title: '', type: ContextMenuKey.CreateFile, nodeKey: '' })

const {
  createFile,
  createFolder,
  rename,
  deleteFileOrFolder,
  moveFileOrFolder,
} = useTreeAction()

const { setContent, setContentFilePath } = useContent()

const treeHeight = computed(() => {
  if (panelConfig?.panelHeight.value) {
    return panelConfig?.panelHeight.value - 10 - 34 - 24 - 60
  }
  return window.innerHeight
})

function genDirColor(title) {
  if (dirSettings.value.dirColor === DirColorEnum.MultiColor) {
    return genColor(title)
  }
  return ''
}

function handleUploadSuccess({ treeData, treeRoot, selectedPath }) {
  setGithubInfo({ localPath: selectedPath })
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

async function handleSelectDir() {
  const selectedPath = await window.api.getSelectedPath()
  if (selectedPath) {
    setGithubInfo({ localPath: selectedPath })
    updateTreeInfo(selectedPath)
  }
}

function handleDragEnter() {}

async function handleDrop(info: AntTreeNodeDropEvent) {
  const dropKey = info.node.key
  const dragKey = info.dragNode.key

  await moveFileOrFolder(dragKey, dropKey, toRaw(treeData.value))
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
