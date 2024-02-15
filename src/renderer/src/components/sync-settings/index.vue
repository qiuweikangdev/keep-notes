<template>
  <div>
    <github-outlined class="w-full justify-center text-[32px] py-[12px] text-[#1677ff]" />
    <!-- <a-spin :spinning="syncLoading || downloadLoading"> -->
    <a-form
      class="p-[20px]"
      :model="formData"
      :label-col="{ style: { maxWidth: '120px', textAlign: 'left' } }"
      :wrapper-col="{ style: { maxWidth: '140px' } }"
    >
      <a-form-item label="用户名" name="username">
        <a-input v-model:value="formData.username" />
      </a-form-item>
      <a-form-item label="仓库名" name="repositoryName">
        <a-input v-model:value="formData.repositoryName" />
      </a-form-item>
      <a-form-item label="上传文件路径" name="uploadDir">
        <a-input v-model:value="formData.uploadDir" class="w-[300px]" />
      </a-form-item>
      <a-form-item label="Access Token" name="accessToken">
        <a-input type="password" v-model:value="formData.accessToken" />
      </a-form-item>
      <a-form-item :wrapper-col="{ span: 14, offset: 2 }">
        <a-button class="px-[24px] bg-[#1677ff]" type="primary" @click="uploadGithub">
          上传
        </a-button>
        <a-button
          :icon="h(CloudDownloadOutlined)"
          class="px-[24px]"
          style="margin-left: 10px"
          @click="downloadGithub"
          >下载
        </a-button>
      </a-form-item>
    </a-form>
    <!-- </a-spin> -->
  </div>
</template>
<script setup lang="ts">
import { h, reactive, ref } from 'vue'
import { GithubOutlined, CloudUploadOutlined, CloudDownloadOutlined } from '@ant-design/icons-vue'
import useFile from '@renderer/hooks/useFile'
import useGithub from '@renderer/hooks/useGithub'

const formData = reactive({
  username: 'qiuweikangdev',
  repositoryName: 'my-test',
  accessToken: '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',
  uploadDir: 'D:\\Desktop\\test'
})

const { getFileListContent } = useFile()
const { batchUploadFile, downloadFile } = useGithub(formData)

const uploadGithub = () => {
  const fileListContent = getFileListContent(formData.uploadDir)
  batchUploadFile(fileListContent)
}

const downloadGithub = async () => {
  await downloadFile()
}
</script>
