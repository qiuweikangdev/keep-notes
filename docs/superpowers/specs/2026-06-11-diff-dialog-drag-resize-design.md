# Diff对话框拖拽和调整大小优化设计

## 概述
优化diff文件比对弹窗的拖拽体验，解决拖拽时的视觉反馈问题和resize时的冲突闪动问题。

## 需求
1. **拖拽体验优化**：鼠标悬浮在头部不需要拖拽图标，正常箭头图标能拖拽即可
2. **resize冲突解决**：通过resize调整窗口大小时，不会误触到拖拽窗口导致闪动
3. **同时操作支持**：drag和resize可以同时进行，需要更好的协调机制

## 架构设计

### 1. 事件协调机制
- 在resize开始时，设置一个`isResizing`状态标志
- 在drag开始时，设置一个`isDragging`状态标志
- 两个状态可以同时存在，但需要协调：resize期间可以继续drag，drag期间可以继续resize
- 使用CSS变量`--dialog-state`来管理状态，状态值可以是复合状态（如`resizing-dragging`）

### 2. dnd-kit配置优化
- 将PointerSensor的激活距离从5px增加到10px
- 在resize期间暂停dnd-kit的传感器
- 移除所有视觉反馈（阴影、透明度）

### 3. CSS状态管理
- 使用CSS变量`--dialog-state`来存储当前状态
- 状态值：`idle`、`dragging`、`resizing`
- 根据状态调整光标和指针事件

### 4. 防抖机制
- 在状态切换时添加100ms防抖
- 避免快速切换导致的视觉闪烁

## 组件设计

### 1. DragResizeProvider（新增）
- 一个React Context，提供drag和resize的状态
- 管理`isResizing`和`isDragging`状态（可以同时为true）
- 提供`startResize`、`endResize`、`startDrag`、`endDrag`方法
- 使用防抖机制避免快速切换
- 提供`isIdle`计算属性，当两个状态都为false时返回true

### 2. DraggableHeader组件修改
- 移除所有视觉反馈（阴影、透明度变化）
- 保持`cursor: default`样式
- 在resize期间可以继续拖拽（协调机制）
- 使用DragResizeProvider的状态

### 3. useResizableDialog Hook修改
- 在resize开始时调用`startResize`
- 在resize结束时调用`endResize`
- 在resize期间可以继续处理drag事件（协调机制）
- 保持现有的几何计算逻辑

### 4. HomePage组件修改
- 包装DragResizeProvider
- 在Dialog.Content上应用CSS变量
- 根据状态调整样式

## 数据流

### 拖拽流程
1. 用户在头部区域按下鼠标 → DragResizeProvider设置`isDragging: true`
2. dnd-kit开始拖拽 → DraggableHeader更新transform
3. 拖拽结束 → DragResizeProvider设置`isDragging: false`，更新dialogOffset

### 调整大小流程
1. 用户在边缘按下鼠标 → DragResizeProvider设置`isResizing: true`
2. resize开始 → useResizableDialog清除transform，应用几何样式
3. resize结束 → DragResizeProvider设置`isResizing: false`

### 同时操作协调
1. 用户在resize期间开始drag → DragResizeProvider同时设置`isResizing: true`和`isDragging: true`
2. 两种操作同时进行 → DragResizeProvider协调状态，确保两种操作都能正常工作
3. 操作结束 → DragResizeProvider相应地更新状态

### 状态重置
- 对话框关闭时重置所有状态
- 使用useEffect监听isOpen变化

## 错误处理

### 1. 快速切换
- 使用防抖机制避免状态冲突
- 防抖时间：100ms
- 确保同时操作时状态正确协调

### 2. 指针丢失
- 监听pointerup和pointercancel事件
- 确保状态正确重置

### 3. 边界保护
- 保持现有的视口边界检查
- 确保对话框不会移出视口

### 4. 状态重置
- 对话框关闭时重置所有状态
- 清除所有内联样式

## 性能优化

### 1. 避免不必要的重渲染
- 使用useCallback避免函数重建
- 使用useMemo缓存计算结果

### 2. 减少状态更新
- 使用useRef存储状态，减少React状态更新
- 批量更新相关状态
- 优化同时操作时的状态更新

### 3. CSS优化
- 使用CSS变量而非内联样式
- 利用CSS的transform进行拖拽，提高性能

## 实现步骤

### 第一步：创建DragResizeProvider
1. 创建新的Context和Provider组件
2. 实现状态管理逻辑
3. 添加防抖机制

### 第二步：修改useResizableDialog
1. 集成DragResizeProvider的状态
2. 在resize开始和结束时更新状态
3. 保持现有的几何计算逻辑

### 第三步：修改DraggableHeader
1. 集成DragResizeProvider的状态
2. 移除视觉反馈
3. 在resize期间禁用拖拽

### 第四步：修改HomePage
1. 包装DragResizeProvider
2. 应用CSS变量
3. 根据状态调整样式

### 第五步：测试和优化
1. 测试拖拽功能
2. 测试resize功能
3. 测试同时操作
4. 优化性能

## 文件结构
```
src/renderer/src/
├── components/
│   └── drag-resize-provider.tsx (新增)
├── hooks/
│   └── use-resizable-dialog.ts (修改)
├── pages/
│   └── home/
│       └── home-page.tsx (修改)
└── features/
    └── diff/
        └── components/
            └── diff-panel.tsx (可能修改)
```

## 验证标准
1. 拖拽时显示箭头光标，无其他视觉反馈
2. resize时不会触发拖拽
3. drag和resize可以同时进行
4. 无视觉闪烁
5. 性能良好，无卡顿

## 风险评估
1. **低风险**：修改现有组件，不涉及新功能
2. **中风险**：需要协调drag和resize事件
3. **低风险**：使用现有的dnd-kit库

## 时间估算
1. 创建DragResizeProvider：2小时
2. 修改useResizableDialog：1小时
3. 修改DraggableHeader：1小时
4. 修改HomePage：1小时
5. 测试和优化：2小时
**总计：7小时**