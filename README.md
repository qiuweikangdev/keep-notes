# Keep Notes

一款简约、专注、高效的 Markdown 笔记应用。

Keep Notes 致力于提供纯粹、流畅的写作体验，让用户专注于记录、整理和沉淀内容，而不是被复杂功能打断，让 Markdown 写作更加高效，它适合用于日常笔记、灵感收集、任务提醒、技术文档、项目记录和知识管理

![](https://raw.githubusercontent.com/qiuweikangdev/keep-notes/master/images/demo.png)

## 功能特性

- **Markdown 编辑器**
  支持 Markdown 语法编写与预览，所见即所得。
  
- **Git 操作**
  支持通过 Git 管理笔记版本，方便同步、备份和追踪历史修改。
  
- **提醒事项**
  可为笔记或任务设置提醒，避免遗漏重要事项。
  
- **应用通知**

  支持自定义的应用通知，通知弹窗可定制化配置。

- **通知推送**
  在合适的时间收到提醒通知，让笔记不仅能记录内容，也能及时收到消息提醒。
  
- **多面板管理**
  支持多面板布局，便于同时查看、编辑和管理多个笔记内容。



## 安装问题

- 首次在 Mac 上打开 Keep Notes 应用时，您会收到“Keep Notes 应用已损坏，无法打开”的错误提示。要解决此问题，请在终端输入如下命令，来解除 Keep Notes 应用的隔离

```bash
xattr -dr com.apple.quarantine "/Applications/Keep Notes.app"
```

