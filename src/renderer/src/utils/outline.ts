export type OutlineNode = {
  text: string
  level: number
  id: string
  key: string | number
  children?: OutlineNode[]
}

/**
 * 根据大纲，生成大纲目录树
 * 节点的匹配规则
 * 1、优先根据data的节点顺序，以及level值的情况
 * 2、如果节点的level相同，2个节点表示同一级
 * 3、如果节点的level低于上一级的level，那么该节点是上一级的子集
 */
export function genTreeByOutline(data: OutlineNode[]): OutlineNode[] {
  const tree: OutlineNode[] = []
  const stack: OutlineNode[] = [] // 用于跟踪当前的父级节点

  data.forEach((node) => {
    const newNode: OutlineNode = { ...node, key: node.id, children: [] }

    // 处理树的层级关系
    while (
      stack.length > 0
      && (stack[stack.length - 1]?.level || 0) >= node.level
    ) {
      stack.pop() // 弹出比当前节点级别高的节点
    }

    if (stack.length === 0) {
      tree.push(newNode) // 如果没有父级，添加到根节点
    }
    else {
      stack[stack.length - 1]?.children?.push(newNode) // 否则添加到当前父级的 children
    }

    stack.push(newNode) // 将当前节点推入栈中，成为下一个节点的父级
  })

  return tree
}
