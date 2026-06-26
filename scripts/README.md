# 开发环境脚本说明

## 概述

这些脚本用于在 macOS 开发环境中实现 ad-hoc 签名和混合开发模式。

## 脚本说明

### `sign-app.sh`

**功能：** 构建应用并进行 ad-hoc 签名

**使用场景：**
- 首次设置开发环境
- 需要重新签名应用时

**使用方法：**
```bash
./scripts/sign-app.sh
# 或
pnpm sign
```

**工作流程：**
1. 运行 `pnpm run build` 构建应用
2. 检测 Mac 架构（arm64/x64）
3. 使用 `codesign --force --deep --sign -` 进行 ad-hoc 签名
4. 验证签名是否成功

---

### `dev-signed.sh`

**功能：** 启动签名应用 + 热更新的混合开发模式

**使用场景：**
- 日常开发，需要热更新功能
- 测试 macOS 原生功能（如通知、更新提示等）

**使用方法：**
```bash
./scripts/dev-signed.sh
# 或
pnpm dev:signed
```

**工作流程：**
1. 检查应用是否存在，不存在则自动构建和签名
2. 验证应用签名是否有效
3. 启动 Vite 开发服务器（端口 5173）
4. 通过 `open` 命令启动签名应用
5. 应用会自动加载 `http://localhost:5173`（支持热更新）

**优势：**
- 通过 `open` 启动的应用有完整的 macOS 原生应用身份
- 支持热更新，无需每次修改代码都重新打包
- 可以测试通知、更新等需要应用签名的功能

---

## 工作原理

### 混合开发模式

传统 Electron 开发有两种模式：

1. **`electron-vite dev` 模式**
   - 优点：热更新快
   - 缺点：没有原生应用身份，无法测试通知等功能

2. **打包后运行模式**
   - 优点：有原生应用身份
   - 缺点：每次修改都需要重新打包

**混合开发模式** 结合了两者的优点：

- 使用 `open` 命令启动打包后的 .app，获得原生应用身份
- 应用内部加载 `http://localhost:5173`，实现热更新
- 通过环境变量 `DEV_SERVER_URL` 控制加载行为

### 主进程逻辑

```typescript
// 开发模式：支持签名应用 + loadURL localhost 的混合开发模式
const devServerUrl = process.env.DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;

if (devServerUrl) {
  // 开发模式：加载 Vite 开发服务器 URL（支持热更新）
  win.loadURL(devServerUrl);
} else if (!app.isPackaged) {
  // electron-vite dev 模式
  win.loadURL(process.env.ELECTRON_RENDERER_URL || "http://localhost:5173");
} else {
  // 生产模式：加载打包后的文件
  win.loadFile(join(__dirname, "../renderer/index.html"));
}
```

---

## 常见问题

### Q: 为什么需要 ad-hoc 签名？

A: macOS 对未签名的应用有诸多限制，特别是：
- 无法显示应用通知
- 无法使用应用更新功能
- 可能被 Gatekeeper 阻止运行

ad-hoc 签名（`-`）是一种免费的本地签名方式，可以让应用获得基本的原生身份。

### Q: 热更新不工作怎么办？

A: 检查以下几点：
1. Vite 开发服务器是否在运行（端口 5173）
2. 应用是否通过 `open` 命令启动
3. 控制台是否有错误信息

### Q: 如何停止开发服务器？

A: 在终端按 `Ctrl+C` 即可停止 Vite 开发服务器。

### Q: 签名后应用无法打开怎么办？

A: 可能是 Gatekeeper 阻止了应用。尝试：
1. 右键点击应用，选择"打开"
2. 或者在系统偏好设置 > 安全性与隐私中允许应用运行

---

## 相关命令

```bash
# 仅签名（不启动开发服务器）
pnpm sign

# 启动混合开发模式（签名 + 热更新）
pnpm dev:signed

# 传统开发模式（无原生身份）
pnpm dev

# 打包应用
pnpm build:mac
```
