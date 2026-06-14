# 主题样式更新实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新黑暗主题配色为中性暖灰风格，并添加 Typora 风格的面板拖拽悬浮效果

**Architecture:** 修改主题配置文件和全局样式文件，无需新增文件或组件

**Tech Stack:** TypeScript, CSS

---

## 文件结构

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| `src/renderer/src/config/themes.ts` | 修改 | 更新 dark 主题的颜色配置 |
| `src/renderer/src/styles/globals.css` | 修改 | 更新面板拖拽手柄的悬浮样式 |

---

### Task 1: 更新黑暗主题配置

**Files:**
- Modify: `src/renderer/src/config/themes.ts:49-70`

- [ ] **Step 1: 读取当前主题配置**

打开 `src/renderer/src/config/themes.ts`，找到 `dark` 主题配置（第 49-70 行）。

当前配置：
```typescript
dark: {
  name: "dark",
  label: "Dark",
  preview: {
    bg: "#0f0f10",
    sidebar: "#18181a",
    accent: "#8f8f99",
    text: "#f4f4f5",
  },
  colors: {
    bgPrimary: "#0f0f10",
    bgSecondary: "#18181a",
    bgTertiary: "#232326",
    textPrimary: "#f4f4f5",
    textSecondary: "#b4b4bb",
    textMuted: "#7c7c86",
    borderColor: "#2a2a2f",
    hoverBg: "#232326",
    activeBg: "#2d2d32",
    accentColor: "#8f8f99",
  },
},
```

- [ ] **Step 2: 更新 preview 对象**

将 preview 对象更新为新的配色：
```typescript
preview: {
  bg: "#2d2d2d",
  sidebar: "#333333",
  accent: "#6cb4ee",
  text: "#e0e0e0",
},
```

- [ ] **Step 3: 更新 colors 对象**

将 colors 对象更新为新的配色：
```typescript
colors: {
  bgPrimary: "#2d2d2d",
  bgSecondary: "#333333",
  bgTertiary: "#404040",
  textPrimary: "#e0e0e0",
  textSecondary: "#b0b0b0",
  textMuted: "#808080",
  borderColor: "#4a4a4a",
  hoverBg: "#404040",
  activeBg: "#4a4a4a",
  accentColor: "#6cb4ee",
},
```

- [ ] **Step 4: 验证修改**

检查修改后的完整 dark 主题配置：
```typescript
dark: {
  name: "dark",
  label: "Dark",
  preview: {
    bg: "#2d2d2d",
    sidebar: "#333333",
    accent: "#6cb4ee",
    text: "#e0e0e0",
  },
  colors: {
    bgPrimary: "#2d2d2d",
    bgSecondary: "#333333",
    bgTertiary: "#404040",
    textPrimary: "#e0e0e0",
    textSecondary: "#b0b0b0",
    textMuted: "#808080",
    borderColor: "#4a4a4a",
    hoverBg: "#404040",
    activeBg: "#4a4a4a",
    accentColor: "#6cb4ee",
  },
},
```

- [ ] **Step 5: 提交更改**

```bash
git add src/renderer/src/config/themes.ts
git commit -m "style: update dark theme to neutral warm gray"
```

---

### Task 2: 更新面板拖拽悬浮样式

**Files:**
- Modify: `src/renderer/src/styles/globals.css:577-586`

- [ ] **Step 1: 读取当前面板拖拽样式**

打开 `src/renderer/src/styles/globals.css`，找到面板调整手柄样式（第 577-586 行）。

当前样式：
```css
/* 面板调整手柄 */
[data-panel-resize-handle-id] {
  position: relative;
  background-color: var(--border-color) !important;
  transition: background-color 0.2s;
}

[data-panel-resize-handle-id]:hover {
  background-color: var(--accent-color) !important;
}
```

- [ ] **Step 2: 更新为 Typora 风格虚线**

将样式更新为虚线效果：
```css
/* 面板调整手柄 - Typora 风格虚线效果 */
[data-panel-resize-handle-id] {
  position: relative;
  background-color: transparent !important;
  border-left: 1px dashed #999999;
  transition: border-color 0.2s;
}

[data-panel-resize-handle-id]:hover {
  border-left-color: #6cb4ee;
}
```

- [ ] **Step 3: 验证修改**

检查修改后的样式：
- 默认状态：透明背景 + 中灰色虚线（#999999）
- 悬浮状态：虚线变为蓝色（#6cb4ee）

- [ ] **Step 4: 提交更改**

```bash
git add src/renderer/src/styles/globals.css
git commit -m "style: add Typora-style dashed resize handle"
```

---

### Task 3: 验证与测试

**Files:**
- 无文件修改

- [ ] **Step 1: 运行类型检查**

```bash
pnpm typecheck
```

预期：无错误

- [ ] **Step 2: 运行代码检查**

```bash
pnpm lint
```

预期：无错误或警告

- [ ] **Step 3: 启动开发服务器**

```bash
pnpm dev
```

预期：应用正常启动

- [ ] **Step 4: 测试黑暗主题**

1. 在应用中打开设置
2. 切换到 Dark 主题
3. 验证：
   - 侧边栏背景为 #333333
   - 编辑区背景为 #2d2d2d
   - 文本颜色为 #e0e0e0
   - 边框颜色为 #4a4a4a

- [ ] **Step 5: 测试面板拖拽效果**

1. 找到面板分隔线
2. 悬浮在分隔线上
3. 验证：
   - 默认显示中灰色虚线（#999999）
   - 悬浮时虚线变为蓝色（#6cb4ee）
4. 拖拽面板，验证功能正常

- [ ] **Step 6: 测试主题切换**

1. 切换回 Light 主题
2. 验证 Light 主题无影响
3. 再次切换到 Dark 主题
4. 验证样式正确应用

---

## 完成

所有任务完成后，运行最终验证：

```bash
pnpm typecheck && pnpm lint && pnpm build
```

预期：所有检查通过，构建成功。

---

**计划创建时间**：2026-06-14
**计划状态**：待执行
