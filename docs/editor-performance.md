# 编辑器性能验证

## 已实现的约束

- 大纲按帧读取实时 ProseMirror 文档，不等待 Markdown 保存；连续编辑只合并刷新，不取消最终更新。
- 普通文本输入按事务范围维护文字长度；标题文字输入复用块定位索引。结构变化和解析重载重建索引。
- 解析缓存按路径、源码、解析器版本复用，显式错误重试独立失效，旧会话的清理写入不能撤销失效状态。
- 富文本预览仅为被动窗格当前可见块及 overscan 导出 HTML，默认每帧预算 4ms。单个复杂块不能中途截断；剩余块移到下一帧。
- 查找打开期间订阅实时文档，匹配计数和高亮不等待保存；关闭后解除订阅。
- 旧文档后台保存优先等待两次动画帧，100ms 超时兜底；显式保存及关闭前冲刷仍走原有协调器。

## Electron 开发环境采样

开发构建在 DevTools Console 提供：

```js
window.keepNotesEditorPerformance.reset();
// 操作编辑器后读取最近最多 128 个样本。
window.keepNotesEditorPerformance.read();
```

报告包含各阶段 count、p50、p95、max（毫秒），解析缓存命中/未命中次数，常驻和脏会话数，预览缓存块数、HTML 导出次数，编辑器 DOM 节点数及 Chromium 提供的 JS 堆大小。不可用的堆统计为 null。报告不包含路径、正文或 HTML。reset 只清空耗时样本；累计缓存计数使用操作前后的差值比较。

`editor:tab-to-paint` 从标签点击计时，`editor:open-to-paint` 从文件打开流程计时，目标富文本窗格挂载后等待两帧结束；取消的样本不计入分位数。它们是绘制机会的近似指标，精确呈现时间仍需 Chromium Performance trace。`editor:transaction` 覆盖同步 dispatch，预览变更分析单独记录为 `editor:preview-transaction`。大纲索引的事务增量维护包含在 transaction 中。

建议用 1 万、5 万、10 万字符的段落、标题、代码、列表、表格混合文档，分别采集：首次打开、缓存重开、已打开标签往返、同文档分栏切换、持续编辑标题。每项交互至少重复 30 次。重点检查常驻标签切换 p95 是否达到 100ms，以及最后一次标题编辑是否在 100ms 内呈现。

内存采样应在打开多个文档、编辑、保存、关闭后分别记录；区分尚未保存的保留会话与可淘汰会话，不以单次堆增长判定泄漏。当前保留原有 4 个后台会话限额、24 个解析缓存条目和 10,000 步撤销深度。

## 自动化计算量基准

```sh
EDITOR_PERF_REPORT=1 pnpm_config_verify_deps_before_run=false pnpm test src/renderer/src/features/editor/lib/editor-large-document-performance.test.ts
```

该基准在 jsdom 中运行真实解析器和 ProseMirror 模型，验证三种文档规模的连续输入复用结构索引，且不请求预览时 HTML 导出次数始终为零。它不包含 Electron 布局、绘制、CodeMirror 节点视图或操作系统调度，不能据此宣称 GUI 切换达到 100ms。

2026-09-11 本机一次样本：

| 字符数 | 顶层块数 | 解析耗时（单次 ms） | 模型事务 p50 / p95（30 次，ms） | 预览 HTML 导出次数 |
| --- | --- | --- | --- | --- |
| 10,000 | 182 | 85.52 | 0.024 / 0.847 | 0 |
| 50,000 | 913 | 105.42 | 0.019 / 0.070 | 0 |
| 100,000 | 1,824 | 176.14 | 0.017 / 0.044 | 0 |

这些数字不是优化前后对比，也不是 GUI 延迟；首组受 JIT 预热影响。大文档冷解析仍存在同步开销，本轮通过缓存复用和取消首屏全文预览导出来减少重复工作，没有替换解析器或虚拟化完整可编辑文档。

验证脚本前临时设置 `pnpm_config_verify_deps_before_run=false` 是为了使用已有依赖，避免当前 pnpm 自动重新安装；不修改项目配置或锁文件。


## 2026-10-01 行内代码体验与输入链路排查

对照实际操作的 [Vditor 即时渲染 demo](https://dxsm.github.io/tools/markdown/)，确认代码末尾光标应先到达关闭反引号左侧，再跨过关闭标记。此次修复：

- 全局 `beforeinput` / `keydown` 的兜底处理只允许所属编辑器，或者没有其他控件占用焦点时的 body/document 事件。原先保留的编辑器引用会截获外部输入框和其他编辑器的输入。
- 保留关闭反引号左侧的输入位置，避免从最后一个字符右移后直接输入到代码外。
- 水平移动和退格按可见字符处理 emoji、ZWJ 组合和组合音标；双击选词按完整代码内容计算，避免光标 widget 分割单词。Shift 点击保留浏览器扩选行为。
- 点击和拖选优先使用浏览器原生文字命中接口，仅在映射失效时测量字符矩形。
- 反引号兜底归一化不再读取全文 `textContent` 或遍历全文后过滤，只访问事务修改范围。多步事务的位置映射、重叠范围合并及无 StepMap 的样式修改均有测试。
- 引用列表输入只检查修改范围及所属引用，直接比较子块结构；删除每次输入遍历所有引用、逐个全文查找和转换 BlockNote 对象的开销。

### Chromium 优化前后采样

使用已有依赖启动临时 Vite 页面，挂载项目实际 `editorSchema`、`BlockNoteView` 和编辑器样式；优化前页面使用当前 Git HEAD 的同一文件。两页使用相同生成文档，每块正文 42 个字符，每 10 块含一个引用。先预热 5 次，再在首块输入 30 次，记录包含 DOM 更新的同步 `dispatch` 耗时。临时验证页面和基线文件完成后移除。

| 总块数 / 引用块数 | 优化前 p50 / p95（ms） | 优化后 p50 / p95（ms） |
| --- | --- | --- |
| 180 / 18 | 0.4 / 0.8 | 0.2 / 0.5 |
| 1,800 / 180 | 12.8 / 14.3 | 1.7 / 2.4 |

上述为本机一次采样，不包含输入到屏幕绘制的完整延迟，不代表 Electron 整体性能承诺。纯段落文档的采样分位数存在噪声，不能据此宣称所有文档都获得同等比例改善。长段落的反引号扫描仍需检查当前文本节点；纵向纯代码导航仍遍历块结构，本次没有虚拟化可编辑文档。

浏览器交互已验证代码内外输入、外部输入框、方向键、emoji、双击选词；组合输入有事件和事务回归覆盖，真实 macOS 中文输入法候选窗口仍需在 Electron 中手工验证。

自动化计算量约束：200 和 2,000 块文档的单次局部输入，两个归一化插件合计访问不超过两个文本节点，不调用全文 `descendants`，不读取全文 `textContent`。

```sh
pnpm_config_verify_deps_before_run=false pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/lib/editor-transaction-ranges.test.ts src/renderer/src/features/editor/lib/inline-code-performance.test.ts
```

验证结果：编辑器及 store 相关测试 874/874 通过；新增回归 17 项。`pnpm typecheck`、`pnpm lint` 和 `pnpm build` 通过，lint 保留仓库既有警告。全量测试 1,503/1,504 通过；唯一失败是未修改的 `styles/globals.test.ts` 中源码编辑器边框断言，正则在 `solid color-mix` 之间只允许字面空格，而原有 CSS 已被格式化为换行，单独执行也能复现。

涉及文件：`blocknote-schema.ts` 的行内代码交互与归一化、`editor-transaction-ranges.ts` 的局部修改范围计算，以及 `blocknote-schema.test.ts`、`editor-transaction-ranges.test.ts`、`inline-code-performance.test.ts` 的体验和计算量回归。

## 2026-10-06 富文本编辑与保存复查

此次复查发现并修复三处问题：

- 字符级源码保留只限制文档长度，未限制编辑距离。将约 4,000 字的一段正文整体替换成不同内容，仍会触发昂贵的字符 diff。两个 diff 现在都限制最多 512 步编辑距离和 8ms 计算预算，超限复用大文档的保留路径，以完整富文本导出为准，并继续检查 Markdown 语义和文件结尾。超限时，部分原始源码排版可能采用编辑器的规范格式。
- 输入法组合输入过程中，行内代码兜底归一化会提前转换候选文本中的成对反引号。现在等待组合输入结束，期间只记录并映射一个局部修改范围；候选词被替换、取消或删除后，清除待处理范围。
- 初始序列化基线依赖两次动画帧，隐藏窗口收不到动画帧时，后续显式保存会一直等待。现在复用两帧绘制调度的 100ms 定时器兜底，覆盖基线尚未完成时编辑并冲刷的情况。

本机 jsdom 单次样本：`old:` 加 4,000 个 `a` 替换为 `new:` 加 4,000 个 `b`，源码结尾使用 CRLF、序列化基线使用 LF。`preserveMarkdownSource` 修复前约 1,013ms，修复后约 13ms。该样本只衡量源码保留计算，不包含 Electron 布局、绘制、磁盘保存或真实输入法延迟。

```sh
EDITOR_PERF_REPORT=1 pnpm test src/renderer/src/features/editor/lib/markdown.test.ts -t 'bulk replacements'
pnpm test src/renderer/src/features/editor --reporter=dot
```

编辑器回归 894/894 通过，新增 7 个用例覆盖计算预算、超时后内容完整性、组合输入确认/取消及无动画帧时初始保存。既有表格连续编辑、局部事务计算量和光标移动用例也通过。真实 macOS 输入法候选窗口仍需在 Electron 中手工验证；单个超大段落、列表或表格的冷解析和导出仍有同步开销。
