import { Menu, BrowserWindow, app, shell } from "electron";
import process from "node:process";
import { APP_REPOSITORY_URL } from "../shared/constants";

// 菜单动作转发给渲染进程
function sendMenuAction(action: string): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("menu:action", action);
  }
}

/**
 * 注册 macOS 应用菜单
 * macOS 的应用菜单是强制要求，第一个菜单项为应用名
 */
export function registerAppMenu(): void {
  if (process.platform !== "darwin") return;

  const template: Electron.MenuItemConstructorOptions[] = [
    // 应用名菜单（macOS 特有）
    {
      label: app.getName(),
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "偏好设置...",
          accelerator: "Cmd+,",
          click: () => sendMenuAction("openSettings"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    // 文件菜单
    {
      label: "文件",
      submenu: [
        {
          label: "新建文件",
          accelerator: "Cmd+N",
          click: () => sendMenuAction("newFile"),
        },
        {
          label: "打开文件夹...",
          accelerator: "Cmd+O",
          click: () => sendMenuAction("openFolder"),
        },
        { type: "separator" },
        {
          label: "保存",
          accelerator: "Cmd+S",
          click: () => sendMenuAction("saveFile"),
        },
        {
          label: "另存为...",
          accelerator: "Shift+Cmd+S",
          click: () => sendMenuAction("saveAs"),
        },
        { type: "separator" },
        {
          label: "关闭标签页",
          accelerator: "Cmd+W",
          click: () => sendMenuAction("closeTab"),
        },
      ],
    },
    // 编辑菜单
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    // 视图菜单
    {
      label: "视图",
      submenu: [
        {
          label: "切换侧边栏",
          accelerator: "Shift+Cmd+B",
          click: () => sendMenuAction("toggleSidebar"),
        },
        {
          label: "搜索",
          accelerator: "Cmd+P",
          click: () => sendMenuAction("openSearch"),
        },
        { type: "separator" },
        {
          label: "切换主题",
          accelerator: "Shift+Cmd+L",
          click: () => sendMenuAction("toggleTheme"),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // 窗口菜单
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ],
    },
    // 帮助菜单
    {
      label: "帮助",
      role: "help",
      submenu: [
        {
          label: "Keep Notes 帮助",
          click: async () => {
            await shell.openExternal(APP_REPOSITORY_URL);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
