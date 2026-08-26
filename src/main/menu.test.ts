import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppMenu } from "./menu";

const originalPlatform = process.platform;

const menuMock = vi.hoisted(() => ({
  buildFromTemplate: vi.fn(
    (template: Electron.MenuItemConstructorOptions[]) => template,
  ),
  setApplicationMenu: vi.fn(),
}));
const getMainWindow = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  Menu: menuMock,
  app: { getName: vi.fn(() => "Keep Notes") },
  shell: { openExternal: vi.fn() },
}));

vi.mock("./window", () => ({
  getMainWindow,
}));

describe("registerAppMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", {
      value: "darwin",
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
    });
  });

  it("uses Cmd+Shift+B for the macOS sidebar toggle menu item", () => {
    registerAppMenu();

    const [template] = menuMock.buildFromTemplate.mock.calls[0];
    const menuItems = template.flatMap((item) =>
      Array.isArray(item.submenu) ? item.submenu : [],
    );
    const sidebarItem = menuItems.find(
      (item) =>
        "click" in item && item.click && item.accelerator === "Shift+Cmd+B",
    );

    expect(sidebarItem).toEqual(
      expect.objectContaining({
        accelerator: "Shift+Cmd+B",
      }),
    );
  });

  it("routes menu actions to the most recently focused main window", () => {
    const focusedWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn() },
    };
    getMainWindow.mockReturnValue(focusedWindow);

    registerAppMenu();

    const [template] = menuMock.buildFromTemplate.mock.calls[0];
    const fileMenu = template.find((item) => item.label === "文件");
    const saveItem = Array.isArray(fileMenu?.submenu)
      ? fileMenu.submenu.find((item) => item.label === "保存")
      : undefined;
    const click = saveItem?.click as (() => void) | undefined;

    click?.();

    expect(getMainWindow).toHaveBeenCalledOnce();
    expect(focusedWindow.webContents.send).toHaveBeenCalledWith(
      "menu:action",
      "saveFile",
    );
  });
});
