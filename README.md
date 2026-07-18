# Keep Notes	

Keep Notes 是一款简洁高效的 Markdown 桌面笔记应用，帮助你快速记录、编辑、管理内容和提醒事项。

![](https://raw.githubusercontent.com/qiuweikangdev/keep-notes/master/images/demo.png)

## 功能

- **Markdown 编辑**：支持 Markdown 编写与实时预览，适合笔记、文档和项目记录。
- **Git 版本管理**：保存历史版本，支持同步、备份和变更追踪。
- **提醒事项**：可为笔记或任务设置提醒，避免遗漏重要事项。
- **应用通知**：支持自定义的应用通知，通知弹窗可定制化配置
- **多面板工作区**：同时查看和编辑多个笔记。
- **浮动窗口**：支持在独立浮动窗口中快速创建提醒和简约编辑器体验。

## 安装问题

- 首次在 Mac 上打开 Keep Notes 应用时，您会收到“Keep Notes 应用已损坏，无法打开”的错误提示。要解决此问题，请在终端输入如下命令，来解除 Keep Notes 应用的隔离

```bash
xattr -dr com.apple.quarantine "/Applications/Keep Notes.app"
```
