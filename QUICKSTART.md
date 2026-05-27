# 快速启动指南

## 前置要求

- Node.js >= 18
- pnpm >= 8
- Git

## 安装步骤

### 1. 进入项目目录

```bash
cd D:\misc\demo\keep-notes
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 启动开发服务器

```bash
pnpm dev
```

## 目录结构说明

```
src/
├── main/              # Electron 主进程
│   ├── index.ts       # 应用入口
│   ├── window.ts      # 窗口管理
│   └── ipc/           # IPC 处理器
├── preload/           # 安全桥接层
│   └── api/           # 暴露给渲染进程的 API
├── renderer/          # React 应用
│   ├── index.html     # HTML 入口
│   └── src/
│       ├── app/       # App 组件
│       ├── components/# UI 组件
│       ├── features/  # 功能模块
│       ├── hooks/     # 自定义 Hooks
│       ├── store/     # 状态管理
│       └── styles/    # 样式文件
└── shared/            # 共享代码
    ├── constants/     # 常量定义
    └── types/         # TypeScript 类型
```

## 开发工作流

### 添加新功能

1. 在 `features/` 创建新目录
2. 创建组件和 Hooks
3. 在 `store/` 添加状态管理（如需要）
4. 在 `pages/` 集成到页面

### 添加新 IPC 通道

1. 在 `shared/constants/ipc-channels.ts` 添加常量
2. 在 `main/ipc/` 添加处理器
3. 在 `preload/api/` 添加 API
4. 在 `renderer/src/types/electron.d.ts` 添加类型

### 添加新 UI 组件

1. 在 `components/ui/` 创建组件
2. 使用 Radix UI 原语
3. 使用 Tailwind CSS 样式
4. 导出到 `components/ui/index.ts`

## 常用命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 代码格式化
pnpm lint:fix

# 打包 Windows
pnpm build:win

# 打包 macOS
pnpm build:mac

# 打包 Linux
pnpm build:linux
```

## 故障排除

### 依赖安装失败

```bash
# 清除缓存
pnpm store prune

# 重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### TypeScript 错误

```bash
# 检查类型
pnpm typecheck
```

### Electron 启动失败

检查 `electron.vite.config.ts` 配置是否正确。

## 下一步

- 阅读 [README.md](./README.md) 了解项目概况
- 查看 [MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md) 了解迁移详情
- 浏览源代码了解实现细节
