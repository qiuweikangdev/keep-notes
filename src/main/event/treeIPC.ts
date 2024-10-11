import {
  createFile,
  createFolder,
  deleteFileOrFolder,
  moveFileOrFolder,
  rename,
} from '../treeAction'

export default {
  'handle:create-file': async (_, path, title, treeData) => {
    return await createFile(path, title, treeData)
  },
  'handle:create-folder': async (_, path, title, treeData) => {
    return await createFolder(path, title, treeData)
  },
  'handle:rename': async (_, path, title, treeData) => {
    return await rename(path, title, treeData)
  },
  'handle:delete-fileOrFolder': async (_, path, title, treeData) => {
    return await deleteFileOrFolder(path, title, treeData)
  },
  'handle:move-fileOrFolder': async (_, sourcePath, targetPath, treeData) => {
    return await moveFileOrFolder(sourcePath, targetPath, treeData)
  },
}
