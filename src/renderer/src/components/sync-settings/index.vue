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
        <!-- <a-form-item label="Access Token" name="accessToken" required>
          <a-input
            v-model:value="formData.accessToken"
            type="password"
            class="dark:bg-transparent"
            allow-clear
          />
        </a-form-item> -->
      </a-form>
    </a-spin>

    <template #footer>
      <div class="flex justify-end">
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
      </div>
    </template>
  </a-modal>
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
import { useStore } from '@renderer/store/index'

const open = defineModel('open', { type: Boolean, default: false })

const formRef = ref()

const { githubInfo: formData, setGithubInfo } = useStore()

const { download, downloadLoading, upload, uploadLoading } = useGitub()

const btnLoading = computed(() => downloadLoading.value || uploadLoading.value)

const rules = computed(() => {
  return Object.keys(formData).reduce((acc, key) => {
    acc[key] = [{ required: true, message: '必填~', trigger: 'change' }]
    return acc
  }, {})
})

function handleOk() {}

function handleCancel() {
  open.value = false
  formRef.value.clearValidate()
}

async function handleSelectedPath() {
  const selectedPath = await window.api.getSelectedPath()
  if (selectedPath) {
    setGithubInfo({ localPath: selectedPath })
    formRef.value.clearValidate(['localPath'])
  }
}
</script>
