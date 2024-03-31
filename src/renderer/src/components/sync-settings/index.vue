<template>
  <a-modal
    v-model:open="open"
    class="!max-w-[500px] !min-w-[300px]"
    width="65vw"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <a-spin :spinning="downloadLoading">
      <github-outlined
        class="flex items-center justify-center text-[24px] cursor-pointer"
      />
      <a-form
        class="p-[20px]"
        :model="formData"
        :label-col="{ style: { width: '100px', textAlign: 'left' } }"
      >
        <a-form-item label="用户名" name="username">
          <a-input
            v-model:value="formData.username"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="仓库名" name="repositoryName">
          <a-input
            v-model:value="formData.repositoryName"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="目录路径" name="uploadDir">
          <a-input
            v-model:value="formData.localPath"
            class="dark:bg-transparent cursor-pointer"
            style="cursor: pointer"
            placeholder="点击选择本地目录"
            allow-clear
            @click="handleSelectedPath"
          >
            <template #addonAfter>
              <upload-outlined @click="handleSelectedPath" />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item label="Access Token" name="accessToken">
          <a-input
            v-model:value="formData.accessToken"
            type="password"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-spin>

    <template #footer>
      <div class="flex justify-end">
        <a-button
          :icon="h(CloudUploadOutlined)"
          class="flex items-center text-[12px]"
          @click="uploadGithub"
        >
          上传
        </a-button>
        <a-button
          :icon="h(CloudDownloadOutlined)"
          class="flex items-center mx-[12px] text-[12px]"
          :loading="downloadLoading"
          @click="downloadGithub"
        >
          下载
        </a-button>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { h } from 'vue'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  GithubOutlined,
  UploadOutlined,
} from '@ant-design/icons-vue'
import useGitub from '@renderer/hooks/useGithub'
import { useStore } from '@renderer/store/index'

const open = defineModel('open', { type: Boolean, default: false })

const { githubInfo: formData, setTreeData, setGithubInfo } = useStore()

const { downloadFile, downloadLoading } = useGitub()

function uploadGithub() {}

async function downloadGithub() {
  const treeData = await downloadFile()
  if (treeData) {
    setTreeData(treeData)
    open.value = downloadLoading.value
  }
}

function handleOk() {}

function handleCancel() {
  open.value = false
}

async function handleSelectedPath() {
  const selectedPath = await window.api.getSelectedPath()
  if (selectedPath) {
    setGithubInfo({ localPath: selectedPath })
  }
}
</script>
