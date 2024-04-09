import { createFile } from '../treeAction'

export default {
  'handle:create-file': async (_, path, title, treeData) => {
    return await createFile(path, title, treeData)
  },
}
