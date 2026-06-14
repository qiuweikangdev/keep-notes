# 主题样式更新设计文档

> 更新日期：2026-06-14
> 状态：待审核

## 一、概述

本次更新旨在优化应用的黑暗主题配色，并为面板拖拽功能添加 Typora 风格的悬浮效果，提升用户体验和视觉一致性。

## 二、目标

1. **优化黑暗主题配色**：从当前的深邃蓝黑风格调整为中性暖灰风格，参考用户提供的 VSCode 截图效果
2. **添加面板拖拽悬浮效果**：采用 Typora 风格的灰色虚线效果，提供清晰的视觉反馈

## 三、设计详情

### 3.1 黑暗主题配色 - 中性暖灰

#### 配色方案

| 颜色变量 | 当前值 | 新值 | 说明 |
|---------|--------|------|------|
| bgPrimary | #0f0f10 | #2d2d2d | 主背景色 |
| bgSecondary | #18181a | #333333 | 次级背景色（侧边栏） |
| bgTertiary | #232326 | #404040 | 三级背景色（悬浮/激活） |
| textPrimary | #f4f4f5 | #e0e0e0 | 主文本色 |
| textSecondary | #b4b4bb | #b0b0b0 | 次级文本色 |
| textMuted | #7c7c86 | #808080 | Muted 文本色 |
| borderColor | #2a2a2f | #4a4a4a | 边框色 |
| hoverBg | #232326 | #404040 | 悬浮背景色 |
| activeBg | #2d2d32 | #4a4a4a | 激活背景色 |
| accentColor | #8f8f99 | #6cb4ee | 主题强调色（柔和蓝） |

#### 预览效果

```
侧边栏（bgSecondary）: #333333
  └── 文本: #e0e0e0 / #b0b0b0

编辑区（bgPrimary）: #2d2d2d
  └── 文本: #e0e0e0

悬浮状态: #404040
激活状态: #4a4a4a
边框: #4a4a4a
强调色: #6cb4ee（蓝色）
```

### 3.2 面板拖拽悬浮效果 - Typora 风格

#### 样式规格

| 属性 | 值 | 说明 |
|------|-----|------|
| border-style | dashed | 虚线样式 |
| border-color | #999999 | 中灰色 |
| border-width | 1px | 纤细线条 |
| cursor | col-resize | 水平调整光标 |

#### CSS 实现

```css
/* 面板调整手柄 - Typora 风格虚线效果 */
[data-panel-resize-handle-id] {
  position: relative;
  background-color: transparent !important;
  border-left: 1px dashed #999999;
  transition: border-color 0.2s;
}

[data-panel-resize-handle-id]:hover {
  border-left-color: #6cb4ee; /* 使用主题强调色 */
}
```

#### 效果说明

- **默认状态**：显示中灰色虚线（#999999）
- **悬浮状态**：虚线变为主题强调色（#6cb4ee）
- **宽度**：1px，保持纤细不抢眼
- **样式**：dashed，与 Typora 风格一致

## 四、涉及修改的文件

### 4.1 主题配置文件

**文件路径**：`src/renderer/src/config/themes.ts`

**修改内容**：
- 更新 `dark` 主题的 `colors` 对象
- 修改所有相关的颜色值

### 4.2 全局样式文件

**文件路径**：`src/renderer/src/styles/globals.css`

**修改内容**：
- 更新 `[data-panel-resize-handle-id]` 样式
- 将实线改为虚线
- 调整颜色值

### 4.3 BlockNote 主题文件（可选）

**文件路径**：`src/renderer/src/styles/blocknote-theme.ts`

**修改内容**：
- 检查是否需要同步更新暗色高亮颜色

## 五、实现步骤

### 步骤 1：更新黑暗主题配置

1. 打开 `src/renderer/src/config/themes.ts`
2. 找到 `dark` 主题配置
3. 更新 `colors` 对象中的所有颜色值
4. 更新 `preview` 对象中的预览颜色

### 步骤 2：更新面板拖拽样式

1. 打开 `src/renderer/src/styles/globals.css`
2. 找到 `[data-panel-resize-handle-id]` 样式块
3. 修改为虚线样式
4. 添加悬浮状态的颜色变化

### 步骤 3：验证与测试

1. 运行 `pnpm typecheck` 确保类型正确
2. 运行 `pnpm lint` 确保代码风格
3. 运行 `pnpm dev` 启动应用
4. 在应用中切换到 Dark 主题
5. 测试面板拖拽悬浮效果

## 六、测试验证

### 6.1 功能测试

- [ ] 切换到 Dark 主题，验证配色正确
- [ ] 悬浮在面板拖拽手柄上，验证显示虚线效果
- [ ] 拖拽面板，验证功能正常
- [ ] 切换回 Light 主题，验证无影响

### 6.2 视觉测试

- [ ] Dark 主题整体色调为中性灰色
- [ ] 侧边栏与编辑区有明显的层次区分
- [ ] 面板拖拽虚线清晰可见但不刺眼
- [ ] 悬浮时虚线颜色变化自然

### 6.3 兼容性测试

- [ ] macOS 平台显示正常
- [ ] Windows 平台显示正常
- [ ] Linux 平台显示正常

## 七、潜在风险

1. **颜色对比度**：新配色可能需要验证文本可读性
2. **样式冲突**：虚线样式可能与其他组件冲突
3. **主题切换**：需要确保主题切换时样式正确更新

## 八、后续优化

1. 考虑为面板拖拽添加动画过渡效果
2. 根据用户反馈微调颜色值
3. 评估是否需要更新其他主题的配色

---

**设计完成时间**：2026-06-14
**设计师**：AI Assistant
**状态**：待用户审核
