import type { ApiResponse } from '@common/types/api'
import { CodeResult } from '@common/types/enum'
import type { SimpleGit } from 'simple-git'
import { simpleGit } from 'simple-git'
import dayjs from 'dayjs'

export async function download(gitConfig: GitConfig): Promise<ApiResponse> {
  const git: SimpleGit = simpleGit({ baseDir: gitConfig.dir })
  try {
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      await git.clone(gitConfig.repoUrl, gitConfig.dir)
    }
    else {
      await git.pull()
    }
    return {
      code: CodeResult.Success,
      message: '下载成功！',
    }
  }
  catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    }
  }
}

export async function upload(gitConfig: GitConfig): Promise<ApiResponse> {
  const git: SimpleGit = simpleGit({ baseDir: gitConfig.dir })
  try {
    const isRepo = await git.checkIsRepo()
    const commitMessage = dayjs().format('YYYY-MM-DD HH:mm:ss')

    if (!isRepo) {
      await git
        .init()
        .addConfig('user.name', gitConfig.username)
        .addConfig('user.email', gitConfig.email)
    }
    else {
      const status = await git.status()
      if (status.files.length === 0) {
        return {
          code: CodeResult.Fail,
          message: '没有文件发生变化',
        }
      }
    }

    await Promise.all([
      git.pull(),
      git.addConfig('user.name', gitConfig.username),
      git.addConfig('user.email', gitConfig.email),
      git.add('.'),
      git.commit(commitMessage),
      git.push('origin', 'HEAD'),
    ])

    return {
      code: CodeResult.Success,
      message: '上传成功！',
    }
  }
  catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    }
  }
}
