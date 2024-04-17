<template>
  <div ref="containerRef" class="relative tree-wrapper h-full w-full">
    <template v-if="treeData?.length">
      <div
        class="absolute top-[6px] left-[4px] whitespace-nowrap px-[12px] my-[px] dark:text-color-primary"
      >
        <folder-open-filled class="text-slate-500 dark:text-slate-400" />
        <span class="ml-[6px] font-semibold">{{ rootNode }}</span>
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
          <a-dropdown :trigger="['contextmenu']">
            <span>{{ title }}</span>
            <template #overlay>
              <a-menu
                @click="
                  ({ key: menuKey, item: { title: menuTitle } }) =>
                    handleContextMenuClick(key, menuKey, menuTitle as string)
                "
              >
                <a-menu-item
                  v-for="item in contextMenuList"
                  :key="item.key"
                  :title="item.title"
                >
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
    <modal
      v-model:open="modalInfo.open"
      :title="modalInfo.title"
      :type="modalInfo.type"
      @ok="handleModalOk"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRaw } from 'vue'
import {
  FileTextFilled,
  FolderFilled,
  FolderOpenFilled,
} from '@ant-design/icons-vue'
import panelConfig from '@renderer/config/panel'
import useContent from '@renderer/hooks/useContent'
import { useStore } from '@renderer/store/index'
import useTreeAction, { ContextMenuKey } from '@renderer/hooks/useTreeAction'
import Upload from './components/upload.vue'
import Modal from './components/modal.vue'

withDefaults(defineProps<{ panelWidth?: number, panelHeight?: number }>(), {
  panelWidth: panelConfig.leftPanelSize,
  panelHeight: window.innerHeight,
})
const { treeData, setTreeData, localPath, setGithubInfo } = useStore()

const containerRef = ref(HTMLElement)
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const modalInfo = reactive<{
  open: boolean
  title: string
  type: ContextMenuKey
  nodeKey: string
}>({ open: false, title: '', type: ContextMenuKey.CreateFile, nodeKey: '' })

const { contextMenuList, createFile, createFolder, rename } = useTreeAction()

const { setContent, setContentFilePath } = useContent()

const rootNode = computed(() => window.api.pathBasename(localPath.value))

function handleUploadSuccess({ treeData, treeRoot }) {
  setTreeData(treeData)
  setGithubInfo({ localPath: treeRoot.key })
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

function handleContextMenuClick(
  nodeKey: string,
  menuKey: string | number,
  menuTitle: string,
) {
  Object.assign(modalInfo, {
    open: true,
    title: menuTitle,
    type: menuKey,
    nodeKey,
  })
}

function handleExpand(keys) {
  expandedKeys.value = keys
}

function handleModalOk(value) {
  const actionMap = {
    createFile: async () => {
      await createFile(modalInfo.nodeKey, value, toRaw(treeData.value))
      modalInfo.open = false
    },
    createFolder: async () => {
      await createFolder(modalInfo.nodeKey, value, toRaw(treeData.value))
      modalInfo.open = false
    },
    rename: async () => {
      await rename(modalInfo.nodeKey, value, toRaw(treeData.value))
      modalInfo.open = false
    },
  }
  actionMap[modalInfo.type]()
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
