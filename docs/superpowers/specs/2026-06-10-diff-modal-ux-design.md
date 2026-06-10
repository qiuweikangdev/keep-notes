# Diff 弹窗 UX 增强设计

日期：2026-06-10
状态：待实现
关联代码：features/diff、components/ui/dialog、pages/home/home-page

## 目标

为 diff 弹窗补充三项 UX 能力，每项作为独立 commit：

1. 弹窗可自由 resize（四角 + 四边，会话内记忆尺寸）。
2. 弹窗 header 关闭按钮旁新增"移到右侧"图标，点击后关闭弹窗、在 HomePage 新增的右侧栏以 panel 形式呈现。
3. 弹窗 header 关闭按钮旁新增"放弃更改"图标，点击触发二次确认，确认后调用 `gitAPI.discardChanges` 并刷新文件。

## 范围

- 涉及：`features/diff/*`、`components/ui/dialog.tsx`、`pages/home/home-page.tsx`、新增 `hooks/use-resizable-dialog.ts` 与 `features/diff/store/diff-panel.store.ts` 与 `features/diff/components/diff-panel.tsx`。
- 不涉及：编辑器内部 panel groups、Git 面板的"放弃更改"行为、文件树右键菜单（保持现状）。
- 不做：尺寸持久化到 localStorage、跨多窗口同步、resize 动画过渡。

## 架构

### 现有结构

- `useDiffStore`（Zustand）保存 `isOpen / filePath / oldContent / newContent`，由 `HomePage` 订阅并渲染 `Dialog.Root`。
- `useDraggableDialog` 提供 contentRef、dragHandleProps、resetPosition，挂在 `DialogHeader`（`cursor-move`）上。
- `DialogContent` 已是 fixed 居中，4px 阴影、12px 圆角（sm:rounded-lg）。

### 变更后结构

- `useDiffStore` 行为不变（仍是弹窗的源数据）。
- 新增 `useDiffPanelStore`（Zustand）：`{ isOpen, filePath, oldContent, newContent, fileName, open, close }`。**与 `useDiffStore` 互斥**：弹窗打开时强制关闭面板，反之亦然。
- 新增 `useResizableDialog`：在 `useDraggableDialog` 同一 contentRef 上叠加尺寸，输出 `resizeHandleProps`（8 个方向：nw/n/ne/e/se/s/sw/w），通过直接修改 contentRef 的 `width/height/left/top` 实现。会话内记忆（用 ref 持有最近一次尺寸，重新打开时复位为默认）。
- `HomePage` 顶层 `PanelGroup direction="horizontal"` 调整为三栏：`[Sidebar, Editor, DiffPanel]`。`DiffPanel` 仅在 `useDiffPanelStore.isOpen` 时挂载并显示内容，否则渲染占位或隐藏（用 `Panel` 的 `collapsible` 与 `ref` 控制显隐）。
- `DialogContent` 内角落渲染 8 个 resize handle（绝对定位、透明 hit area + Tailwind cursor-* 类）。

### 互斥规则

```
openDiffModal()  -> useDiffStore.open(); useDiffPanelStore.close();
moveDiffToPanel() -> useDiffStore.close(); useDiffPanelStore.open(payload);
```

## 组件 / 文件

### 新增

| 文件 | 作用 |
|---|---|
| `src/renderer/src/hooks/use-resizable-dialog.ts` | 四角+四边 resize，会话内记忆尺寸，clamp 到视口 |
| `src/renderer/src/features/diff/store/diff-panel.store.ts` | diff 面板状态 |
| `src/renderer/src/features/diff/components/diff-panel.tsx` | 右侧 panel 内容（标题栏 + DiffViewer + 关闭按钮） |

### 修改

| 文件 | 变更 |
|---|---|
| `src/renderer/src/components/ui/dialog.tsx` | DialogContent 支持 resize handle slots；导出 `DialogResizeHandles`（可选） |
| `src/renderer/src/pages/home/home-page.tsx` | PanelGroup 三栏；组装 Dialog 弹窗（绑定 resize + 新按钮）；订阅面板 store |
| `src/renderer/src/features/diff/index.ts` | 导出 DiffPanel 相关 |
| `src/renderer/src/store/diff.store.ts` | 增加 `openDiffModal` 复合 action（同时关闭面板） |
| `src/renderer/src/hooks/use-draggable-dialog.ts` | 不变（与 resize 共用同一 ref） |

## 数据流

### 弹窗 → 面板

1. 用户点击弹窗 header 的 `PanelRightOpen` 图标。
2. 触发 `handleMoveToPanel()`：
   - 读取当前 `useDiffStore` 数据。
   - `useDiffStore.close()`（弹窗消失）。
   - `useDiffPanelStore.open({ filePath, oldContent, newContent, fileName })`。
3. HomePage 监听面板 store，挂载/显示 `DiffPanel`。

### 面板 → 关闭

- `DiffPanel` 标题栏 `X` 按钮 → `useDiffPanelStore.close()`。

### 放弃更改（弹窗内）

1. 用户点击弹窗 header 的 `Undo2` 图标。
2. 触发 `handleDiscardInDiff()`：
   - 弹出 `ConfirmDialog`（复用 `components/ui/confirm-dialog.tsx`），标题"放弃此文件的更改？"，描述"此操作不可撤销"，确认/取消按钮。
   - 用户确认后：
     - 复用 `editor-toolbar` 中 `handleDiscard` 的逻辑（提取为 `src/renderer/src/features/git/lib/discard-file-changes.ts`，参数 `dirPath / filePath / relativePath`），避免重复代码。
     - `useDiffStore.close()`。
     - 重新 `loadTree(repositoryRoot)`。
   - 失败：toast 报错，弹窗保持开启。

## 错误处理

| 场景 | 行为 |
|---|---|
| `discardChanges` IPC 返回非 Success | 弹窗不关闭；toast 报错；保持编辑状态 |
| `relativePath` 解析失败 | ConfirmDialog 不弹；toast 报错 |
| 无 `filePath` | 按钮 disabled，title 提示"无可用操作" |
| resize 超出视口 | clamp 到 `[minWidth=400, maxWidth=视口宽-20, minHeight=240, maxHeight=视口高-20]` |
| 文件已被删除（discard 后 readFile 失败） | 复用 `handleDiscard` 已有的 `resetTab` 逻辑 |

## 测试

仓库无单元测试框架（无 vitest/jest 配置）。验收手段：

1. **功能 1**：
   - 打开 diff 弹窗。
   - 拖动右下角，尺寸变化。
   - 拖动四边/四角，尺寸变化。
   - 关闭弹窗再打开，尺寸复位为默认。
2. **功能 2**：
   - 打开 diff 弹窗，点击 `PanelRightOpen` 图标。
   - 弹窗关闭，右侧出现 diff 面板。
   - 在面板内调整宽度（拖动分割条）。
   - 关闭面板。
   - 再次打开 diff 弹窗，确认面板已关闭（互斥）。
3. **功能 3**：
   - 打开 diff 弹窗，点击 `Undo2` 图标。
   - 弹出 ConfirmDialog，取消 → 弹窗保持。
   - 再次点击，确认 → 弹窗关闭 + 文件回到 HEAD 状态 + 文件树刷新。
   - 模拟 IPC 失败：toast 报错 + 弹窗保持。

## 实施顺序（对应 commit）

1. `feat(diff): add free resize to diff dialog`
2. `feat(diff): add move-to-panel action and right-side diff panel`
3. `feat(diff): add discard-changes action with confirmation`

每个 commit 后跑 `pnpm typecheck && pnpm lint` 验证。
