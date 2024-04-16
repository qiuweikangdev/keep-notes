import { createFile, createFolder } from '../treeAction'

export default {
  'handle:create-file': async (_, path, title, treeData) => {
    return await createFile(path, title, treeData)
  },
  'handle:create-createFolder': async (_, path, title, treeData) => {
    return await createFolder(path, title, treeData)
  },
}
