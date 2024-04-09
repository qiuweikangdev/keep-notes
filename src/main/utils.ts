import { BrowserWindow } from 'electron/main'

export function getBrowserWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

export function findNodeByKey(treeData, key) {
  for (const node of treeData) {
    if (node.key === key) {
      return node
    }
    else if (Array.isArray(node.children)) {
      const foundNode = findNodeByKey(node.children, key)
      if (foundNode)
        return foundNode
    }
  }
}
