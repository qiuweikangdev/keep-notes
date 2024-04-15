import { getBrowserWindow } from '../utils'
import {
  getSelectedPath,
  openDialog,
  readFileContent,
  updateLocalDirectory,
  writeFileContent,
} from '../file'

export default {
  'handle:open-directory': async (event) => {
    const win = getBrowserWindow(event)
    return await openDialog(win)
  },
  'handle:read-file-content': async (_, filePath) => {
    const content = await readFileContent(filePath)
    return content
  },
  'on:write-file-content': async (_, filePath, content) => {
    await writeFileContent(filePath, content)
  },
  'on:update-local-directory': async (_, treeData, path) => {
    await updateLocalDirectory(treeData, path)
  },
  'handle:get-selected-path': async (event) => {
    const win = getBrowserWindow(event)
    const selectedPath = await getSelectedPath(win)
    return selectedPath
  },
}
