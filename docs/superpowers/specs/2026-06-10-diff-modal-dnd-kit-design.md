# diff 弹窗改用 dnd-kit 设计

日期：2026-06-10
状态：待实现
关联代码：hooks/use-draggable-dialog.ts、pages/home/home-page.tsx

## 目标

将 diff 弹窗的拖拽能力从自写 `useDraggableDialog` 迁移到 **`@dnd-kit/core`**，光标使用系统默认箭头（不使用 grab/grabbing），整个 DialogHeader 区域都可拖动。Resize 保留现有 `useResizableDialog` 不变。

## 动机

- 自写的 `useDraggableDialog` 多次修复仍存在与 resize 按钮、关闭按钮的事件冲突（用户最新反馈）
- `@dnd-kit/core` 是 React 生态最流行的拖拽库，自带 PointerSensor / KeyboardSensor / 距离约束 / 可访问性
- 通过 `activationConstraint: { distance: 5 }` 避免误触：用户点击按钮时不会立即激活 drag，需移动 5px 才激活
- dnd-kit 用 `transform: translate3d(x, y, 0)` 渲染拖拽位移，避开 inline left/top 与 resize 的样式冲突
- 默认光标保持系统箭头（不显式设置 cursor: grab）

## 范围

- 涉及：新增 `@dnd-kit/core` 依赖；删除 `useDraggableDialog.ts` 与其测试；改写 `home-page.tsx` 的弹窗 drag 部分
- 不涉及：resize 实现（保留自写 `useResizableDialog`）；放弃更改流程；移到右侧面板流程；拖拽后端 `right-side diff panel`
- 不做：触摸拖拽优化（dnd-kit 已支持 PointerSensor，自动覆盖触摸）；多弹窗同步拖拽；拖拽动画

## 架构

### 现状

- `useDraggableDialog` 自写：onPointerDown 在 DialogHeader 上 `setPointerCapture` + 改 inline `left/top/transform: none`
- `useResizableDialog` 自写：8 个 handle 元素的 onPointerDown + setPointerCapture + 改 inline `left/top/width/height`

### 变更后

- 移除 `useDraggableDialog`，不再有手动 drag 逻辑
- HomePage 在 `Dialog.Root` 之外增加一个 `<DndContext>` 包装器（因为整个 diff 弹窗只有一个 draggable，没必要多 DndContext，但需要 sensor 配置）
- 实际上可以**仅在 DialogContent 内部**用 `<DndContext>` —— dnd-kit 允许多个 DndContext 嵌套，最顶层那个生效
- DialogHeader 改为 `useDraggable` 节点；返回的 `setNodeRef` + `listeners` + `attributes` 绑到 DialogHeader
- 拖拽进行中 dnd-kit 通过 `transform` prop 传回 `{x, y}`，用 `style={{ transform: ... }}` 渲染位移
- 拖拽结束时调用 `onDragEnd` 拿到最终 `{x, y}`，写入 React state（**关键**：dnd-kit 不会自动持久化位置，需要手动保存）
- 持久化的位置用 **inline `style.transform`** 或 **inline `style.left/top`**——优先 transform，与 dnd-kit 拖拽中一致

### 与 resize 的协作

- 拖拽结束保存到 `dialogPosition: {x, y}` state
- `useEffect` 监听 `dialogPosition` 变化，写入 DialogContent 的 `style.transform = translate3d(x, y, 0)`
- resize 触发时**先**读 `getBoundingClientRect()` 拿到**包含 transform 的**真实视口位置，作为新基准
- resize 设 inline `left/top/width/height` + `transform: none`（与现在一致），同时把 `dialogPosition` 重置为 `null`（让 DialogContent 用 inline 定位）
- **关键改进**：resize 结束后同步更新 `dialogPosition = {x: newLeft, y: newTop}` 让后续 drag 起点正确

### 与 DialogHeader 按钮的协调

- 按钮上 **不需要** `onPointerDown stopPropagation`——dnd-kit 的 `activationConstraint.distance = 5` 让 pointer 静止时不会激活 drag，按钮的 onClick 正常触发
- 移动 ≥ 5px 后 dnd-kit 才接管 drag，按钮的 click 自动被取消（标准行为）

## 组件 / 文件

### 新增

无（仅新增 npm 依赖）。

### 修改

| 文件 | 变更 |
|---|---|
| `package.json` | 新增 `@dnd-kit/core` 依赖 |
| `src/renderer/src/pages/home/home-page.tsx` | 移除 `useDraggableDialog`；用 `useDraggable` + `DndContext` 包装弹窗 |
| `src/renderer/src/hooks/use-draggable-dialog.ts` | 删除（不再使用） |
| `src/renderer/src/hooks/use-draggable-dialog.test.tsx` | 删除（hook 已删除） |

## 数据流

### 拖拽流程

1. 用户在 DialogHeader 上 pointerdown → dnd-kit PointerSensor 记录起点，未激活
2. 用户移动 ≥ 5px → dnd-kit 激活 drag，触发 `onDragStart`
3. 用户继续移动 → dnd-kit 通过 `transform` 传回位移，DialogContent `style.transform = translate3d(x, y, 0)`
4. 用户释放鼠标 → dnd-kit 触发 `onDragEnd`，传入最终 `{x, y}`
5. HomePage 拿到 `{x, y}` 后 `setDialogPosition({x, y})`
6. DialogContent 在 React render 中应用 `style.transform = translate3d(x, y, 0)`，与 dnd-kit 拖拽中位置一致

### Resize 流程

1. 用户在 handle 上 pointerdown → `useResizableDialog` onPointerDown 记录起点
2. 用户拖动 → onPointerMove 计算新尺寸/位置，inline 写 `left/top/width/height` + `transform: none`
3. 用户释放 → 触发 `onDragEnd` of resize（即 onPointerUp）
4. HomePage 监听 resize 完成事件（通过 `useResizableDialog` 返回额外的 `onResizeEnd` 回调），同步 `setDialogPosition(null)` 并把新位置写入 inline `left/top`
5. 下次拖拽时，dnd-kit 从 `transform: none` 状态开始（因为 `dialogPosition = null`），重新建立起点

### 关闭/重置

- `isOpen` 由 false → true：HomePage `useEffect` 调 `resetPosition()` + `resetSize()`
- `resetPosition()` 把 `dialogPosition` 设为 null，清空 inline transform
- DialogContent 回到 CSS class 居中（`left-[50%] top-[50%] translate(-50%,-50%)`）

## 错误处理

| 场景 | 行为 |
|---|---|
| dnd-kit 安装失败 / API 不匹配 | typecheck/build 失败，需回退到自写 hook |
| DialogContent 在拖拽中位置抖动 | dnd-kit 用 `transform: translate3d` 走 GPU，应无抖动 |
| 拖拽过程中窗口 resize | dnd-kit 的 transform 不会跟随窗口变化；resize hook 同样需要重新定位——保持现状（不做窗口 resize 时的位置重计算） |
| 键盘拖拽（dnd-kit KeyboardSensor）| dnd-kit 默认支持，方向键移动；与鼠标拖拽共享同一 `setDialogPosition` 路径 |

## 测试

仓库无 vitest 在 src/hooks 中（已删除 drag hook 测试），验收手段：

1. **功能**：
   - 打开 diff 弹窗，鼠标在 DialogHeader 任意位置按下并移动 ≥ 5px，弹窗跟随移动
   - 鼠标静止点击 X 按钮、Undo2 按钮、PanelRightOpen 按钮，对应行为正常触发
   - 拖动后弹窗位置持久化（本次会话）；关闭重开后位置复位
2. **resize 兼容**：
   - 拖动后弹窗，鼠标移到右下角 12px 区域，cursor 变 se-resize
   - 拖动 resize 把手，弹窗尺寸变化
   - resize 之后再拖动，drag 从新位置开始
3. **光标**：
   - DialogHeader 默认 cursor: move/auto（dnd-kit 不会强制设 cursor），用户要求"正常箭头"——显式 `cursor: default` 在 DialogHeader
   - 按钮区域 cursor 仍为默认箭头

## 实施顺序

1. `pnpm add @dnd-kit/core`
2. 改写 `home-page.tsx`：删除 `useDraggableDialog` 使用；新增 `useDraggable` + `DndContext`；保存 `dialogPosition` state
3. 同步 resize 完成回调（更新 `useResizableDialog` 返回 `onResizeEnd`，或 HomePage 通过 ref 监听）
4. 删除 `use-draggable-dialog.ts` + `use-draggable-dialog.test.tsx`
5. `pnpm typecheck && pnpm lint && pnpm build`

## 风险

- `@dnd-kit/core` 在 React 19 上的 SSR 兼容性需确认（Electron 渲染进程非 SSR，但 useEffect 时序可能变化）
- 现有 `useResizableDialog` 的 inline `transform: none` 会与 dnd-kit 的 `transform: translate3d` 冲突——resize 结束后必须把 `dialogPosition` 重置为 `null`，让 DialogContent 走 inline `left/top` 模式
- dnd-kit 体积约 30KB gzip，可接受
