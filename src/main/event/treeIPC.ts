import { createFile, createFolder, rename } from '../treeAction'

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
}
