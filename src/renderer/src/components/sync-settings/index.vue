<template>
  <a-modal v-model:open="open" @ok="handleOk" @cancel="handleCancel">
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
        />
      </a-form-item>
      <a-form-item label="仓库名" name="repositoryName">
        <a-input
          v-model:value="formData.repositoryName"
          class="dark:bg-transparent"
        />
      </a-form-item>
      <a-form-item label="目录路径" name="uploadDir">
        <a-input
          v-model:value="formData.uploadDir"
          class="dark:bg-transparent"
        />
      </a-form-item>
      <a-form-item label="Access Token" name="accessToken">
        <a-input
          v-model:value="formData.accessToken"
          type="password"
          class="dark:bg-transparent"
        />
      </a-form-item>
    </a-form>

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
          @click="downloadGithub"
        >
          下载
        </a-button>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { h, reactive } from 'vue'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  GithubOutlined,
} from '@ant-design/icons-vue'

const open = defineModel('open', { type: Boolean, default: false })

const formData = reactive({
  username: 'qiuweikangdev',
  repositoryName: 'my-test',
  accessToken: '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',
  uploadDir: 'D:\\Desktop\\test',
})

function uploadGithub() {}

async function downloadGithub() {}

function handleOk() {}

function handleCancel() {
  open.value = false
}
</script>
