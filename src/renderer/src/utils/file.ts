export function parseFileContent(content) {
  // 解码 base64 字符串为二进制数据
  const binaryString = atob(content)
  const bytes = new Uint8Array(binaryString.length)

  // 防止乱码
  for (let i = 0; i < binaryString.length; i++)
    bytes[i] = binaryString.charCodeAt(i)

  // 解析 JSON 字符串
  const decodedContent = new TextDecoder('utf-8').decode(bytes)
  return decodedContent
}

export function fileTreeSort(treeData) {
  const sortedTreeData = [...treeData]

  sortedTreeData.sort((a, b) => {
    if (a.children && !b.children) {
      return -1 // a 是目录，b 是文件，a 在前面
    }
    else if (!a.children && b.children) {
      return 1 // a 是文件，b 是目录，b 在前面
    }
    else {
      return a.fileName.localeCompare(b.fileName, undefined, {
        sensitivity: 'base',
      })
    }
  })

  for (const node of sortedTreeData) {
    if (node.children && node.children.length > 0) {
      node.children = fileTreeSort(node.children)
    }
  }

  return sortedTreeData
}
