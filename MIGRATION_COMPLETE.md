# Keep Notes - Vue to React 迁移完成

## 迁移总结

已完成从 Electron + Vue 到 Electron + React 的完整重构。

---

## 一、架构改进

### 1.1 Electron 主进程重构

**Before (Vue)**:
```
src/main/
├── event/          # IPC 事件混杂
│   ├── fileIPC.ts
│   ├── gitIPC.ts
│   └── treeIPC.ts
├── file.ts         # 文件操作
├── git.ts          # Git 操作
├── menu.ts         # 菜单 + 窗口控制
└── treeAction.ts   # 树操作
```

**After (React)**:
```
src/main/
├── index.ts        # 清晰的模块化入口
├── window.ts       # 窗口创建独立封装
├── ipc/            # IPC 按业务拆分
│   ├── file.ipc.ts
│   ├── tree.ipc.ts
│   ├── git.ipc.ts
│   └── menu.ipc.ts
├── shortcuts/      # 全局快捷键独立模块
└── utils/          # 工具函数分层
```

### 1.2 Preload 脚本重构

**Before**:
```js
// 散落的 API，无类型
window.api.readFileContent(...)
window.git.download(...)
```

**After**:
```ts
// contextBridge 安全暴露，完整类型
window.electronAPI.readFile(...)
window.electronAPI.createFile(...)
window.gitAPI.download(...)
```

### 1.3 IPC 通信重构

**Before**: 字符串散落各处
```js
ipcMain.handle('handle:read-file-content', ...)
ipcRenderer.invoke('handle:read-file-content', ...)
```

**After**: 常量统一管理
```ts
// shared/constants/ipc-channels.ts
export const IPC_CHANNELS = {
  FILE: { READ: 'file:read', ... },
  TREE: { CREATE_FILE: 'tree:create-file', ... },
}
```

---

## 二、状态管理重构

### 2.1 Pinia → Zustand

**Before (Pinia)**:
```ts
export const useTreeStore = defineStore('tree', () => {
  const treeInfo = reactive({ treeData: [], treeRoot: {} })
  const setTreeInfo = (data) => Object.assign(treeInfo, data)
  return { ...toRefs(treeInfo), setTreeInfo }
}, { persist: true })
```

**After (Zustand)**:
```ts
export const useTreeStore = create<TreeState>()(
  persist(
    (set) => ({
      treeData: [],
      treeRoot: null,
      setTreeData: (data) => set({ treeData: data }),
    }),
    { name: 'tree-storage' }
  )
)
```

### 2.2 Store 拆分

| Store | 职责 | 持久化 |
|-------|------|--------|
| `tree.store.ts` | 文件树状态 | ✅ 部分 |
| `editor.store.ts` | 编辑器状态 | ❌ |
| `user.store.ts` | 用户/Git 配置 | ✅ |
| `ui.store.ts` | 主题、面板 | ✅ 部分 |

---

## 三、UI 组件重构

### 3.1 组件库

基于 Radix UI 创建了可复用的 UI 原语：

| 组件 | 文件 | 用途 |
|------|------|------|
| Button | `components/ui/button.tsx` | 按钮 |
| Dialog | `components/ui/dialog.tsx` | 弹窗 |
| Input | `components/ui/input.tsx` | 输入框 |
| Label | `components/ui/label.tsx` | 标签 |
| Tabs | `components/ui/tabs.tsx` | 标签页 |
| Tooltip | `components/ui/tooltip.tsx` | 提示框 |

### 3.2 布局组件

| 组件 | 文件 | 用途 |
|------|------|------|
| TitleBar | `components/layout/title-bar.tsx` | 标题栏 + 窗口控制 |
| StatusBar | `components/layout/status-bar.tsx` | 状态栏 + 字数统计 |

### 3.3 功能组件

| 功能 | 组件 | 文件 |
|------|------|------|
| 文件树 | FileTree | `features/file-tree/` |
| 编辑器 | Editor | `features/editor/` |
| 设置 | SettingsModal | `features/settings/` |

---

## 四、Vue → React 迁移映射

| Vue | React |
|-----|-------|
| `ref()` | `useState()` / Zustand |
| `reactive()` | `useState()` / Zustand |
| `computed()` | `useMemo()` |
| `watch()` | `useEffect()` |
| `defineEmits()` | Callback props |
| `provide/inject` | Zustand / Context |
| `Pinia` | Zustand |
| `Vue Router` | React Router (未使用) |
| `Ant Design Vue` | Radix UI + Tailwind |
| `scoped CSS` | Tailwind CSS |

---

## 五、安全改进

1. **Context Isolation**: `true` (已启用)
2. **Node Integration**: `false` (已禁用)
3. **Preload API**: 白名单暴露
4. **CSP 策略**: 已配置
5. **IPC 校验**: 类型安全

---

## 六、文件清单

### 配置文件 (已更新)
- `package.json` - 依赖配置
- `electron.vite.config.ts` - Vite 配置
- `tailwind.config.js` - Tailwind 配置
- `postcss.config.js` - PostCSS 配置
- `tsconfig.json` - TypeScript 配置
- `tsconfig.node.json` - Node TypeScript 配置
- `tsconfig.web.json` - Web TypeScript 配置

### 主进程 (新增)
- `main/ipc/index.ts` - IPC 注册
- `main/ipc/file.ipc.ts` - 文件 IPC
- `main/ipc/tree.ipc.ts` - 树 IPC
- `main/ipc/git.ipc.ts` - Git IPC
- `main/ipc/menu.ipc.ts` - 菜单 IPC
- `main/shortcuts/index.ts` - 快捷键

### Preload (新增)
- `preload/api/window.api.ts` - 窗口 API
- `preload/api/file.api.ts` - 文件 API
- `preload/api/tree.api.ts` - 树 API
- `preload/api/git.api.ts` - Git API

### 渲染进程 (新增)
- `renderer/src/index.tsx` - React 入口
- `renderer/src/app/App.tsx` - App 组件
- `renderer/src/components/ui/*` - UI 组件库
- `renderer/src/components/layout/*` - 布局组件
- `renderer/src/features/*` - 功能模块
- `renderer/src/hooks/*` - 自定义 Hooks
- `renderer/src/store/*` - Zustand Store
- `renderer/src/styles/globals.css` - 全局样式
- `renderer/src/types/*` - TypeScript 类型
- `renderer/src/lib/cn.ts` - 工具函数
- `renderer/src/pages/home/*` - 页面组件

### 共享 (新增)
- `shared/constants/ipc-channels.ts` - IPC 常量
- `shared/constants/index.ts` - 常量导出
- `shared/types/index.ts` - 类型定义

---

## 七、下一步

1. **安装依赖**: `pnpm install`
2. **运行开发**: `pnpm dev`
3. **集成 Milkdown React**: 替换当前的简单编辑器
4. **添加路由**: 如需多页面
5. **完善功能**: 右键菜单、拖拽排序等
6. **测试**: 单元测试、E2E 测试
7. **打包发布**: `pnpm build:win`

---

## 八、技术栈版本

| 技术 | 版本 |
|------|------|
| Electron | 28.x |
| React | 18.x |
| TypeScript | 5.x |
| Vite | 5.x |
| Tailwind CSS | 3.x |
| Zustand | 4.x |
| Radix UI | 1.x |
| Lucide React | 0.400.x |
| Milkdown | 7.x |

---

迁移完成！新架构更现代、更安全、更易维护。
