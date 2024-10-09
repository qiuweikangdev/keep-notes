<template>
  <div class="flex flex-col">
    <a-spin :spinning="downloadLoading">
      <github-outlined
        class="flex items-center justify-center text-[24px] cursor-pointer"
      />
      <a-form
        ref="formRef"
        class="p-[20px]"
        :model="formData"
        :label-col="{ style: { width: '100px', textAlign: 'left' } }"
        :rules="rules"
      >
        <a-form-item label="用户名" name="username" required>
          <a-input
            v-model:value="formData.username"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="邮箱" name="email" required>
          <a-input
            v-model:value="formData.email"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="目录路径" name="localPath" required>
          <a-input
            v-model:value="formData.localPath"
            class="dark:bg-transparent cursor-pointer"
            style="cursor: pointer"
            placeholder="请选择文件夹"
            disabled
            allow-clear
            :title="formData.localPath"
          >
            <template #addonAfter>
              <folder-open-filled
                class="w-[32px] flex justify-center"
                @click="handleSelectedPath"
              />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item label="仓库地址" name="repoUrl" required>
          <a-input
            v-model:value="formData.repoUrl"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-spin>

    <div class="flex justify-end">
      <a-space>
        <a-button
          :icon="h(CloudUploadOutlined)"
          class="flex items-center"
          :loading="btnLoading"
          @click="upload"
        >
          上传
        </a-button>
        <a-button
          :icon="h(CloudDownloadOutlined)"
          class="text-color-primary-hover border-color-primary-hover/35 flex items-center"
          :loading="btnLoading"
          @click="download"
        >
          下载
        </a-button>
      </a-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  FolderOpenFilled,
  GithubOutlined,
} from '@ant-design/icons-vue'
import useGitub from '@renderer/hooks/useGithub'
import { useUserStore } from '@renderer/store/modules/user'
import { storeToRefs } from 'pinia'

const formRef = ref()

const { setGithubInfo } = useUserStore()
const userStore = useUserStore()

const { githubInfo: formData } = storeToRefs(userStore)

const { download, downloadLoading, upload, uploadLoading } = useGitub()

const btnLoading = computed(() => downloadLoading.value || uploadLoading.value)

const rules = computed(() => {
  return Object.keys(formData).reduce((acc, key) => {
    acc[key] = [{ required: true, message: '必填~', trigger: 'change' }]
    return acc
  }, {})
})

async function handleSelectedPath() {
  const selectedPath = await window.api.getSelectedPath()
  if (selectedPath) {
    setGithubInfo({ localPath: selectedPath })
    formRef.value.clearValidate(['localPath'])
  }
}
</script>
