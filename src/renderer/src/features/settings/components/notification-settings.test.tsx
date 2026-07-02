import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_CONFIG } from "@/types";
import { useNotificationStore } from "@/store/notification.store";
import { NotificationSettings } from "./notification-settings";

describe("NotificationSettings", () => {
  const electronAPI = {
    getNotificationConfig: vi.fn(async () => DEFAULT_NOTIFICATION_CONFIG),
    setNotificationConfig: vi.fn(async () => undefined),
    testNotificationChannel: vi.fn(async () => ({ success: true })),
    onNotificationConfigChanged: vi.fn(() => vi.fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: electronAPI,
    });
    useNotificationStore.setState({
      config: DEFAULT_NOTIFICATION_CONFIG,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("updates the desktop notification app name", async () => {
    render(<NotificationSettings />);

    expect(screen.queryByText("应用通知配置")).not.toBeInTheDocument();

    const input = await screen.findByLabelText("通知标题");
    fireEvent.change(input, { target: { value: "个人提醒" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        desktop: {
          ...DEFAULT_NOTIFICATION_CONFIG.desktop,
          appName: "个人提醒",
        },
      });
    });
  });

  it("places the notification title setting below persistent display", async () => {
    render(<NotificationSettings />);

    const persistentLabel = await screen.findByText("持续显示");
    const titleLabel = screen.getByText("通知标题");

    expect(
      persistentLabel.compareDocumentPosition(titleLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("updates desktop notification icon visibility", async () => {
    render(<NotificationSettings />);

    fireEvent.click(await screen.findByLabelText("显示应用图标"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        desktop: {
          ...DEFAULT_NOTIFICATION_CONFIG.desktop,
          showAppIcon: false,
        },
      });
    });
  });

  it("updates desktop notification title font size", async () => {
    render(<NotificationSettings />);

    const input = await screen.findByLabelText("标题字号");
    fireEvent.change(input, { target: { value: "22" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        desktop: {
          ...DEFAULT_NOTIFICATION_CONFIG.desktop,
          appNameFontSize: 22,
        },
      });
    });
  });

  it("switches title and background colors between default and custom modes", async () => {
    render(<NotificationSettings />);

    expect(screen.getByLabelText("选择标题颜色取色器")).toHaveAttribute(
      "type",
      "color",
    );
    expect(screen.getByLabelText("选择标题颜色取色器")).toHaveClass("sr-only");
    expect(screen.getByLabelText("标题颜色使用默认值")).toBeChecked();
    expect(screen.getByLabelText("标题颜色")).toBeDisabled();
    expect(screen.getByLabelText("选择通知背景色取色器")).toHaveAttribute(
      "type",
      "color",
    );
    expect(screen.getByLabelText("选择通知背景色取色器")).toHaveClass(
      "sr-only",
    );
    expect(screen.getByLabelText("通知背景色使用默认值")).toBeChecked();
    expect(screen.getByLabelText("通知背景色")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "选择标题颜色" }),
    ).toHaveAttribute("data-color-swatch", "true");

    fireEvent.click(screen.getByLabelText("标题颜色使用自定义"));
    await waitFor(() => {
      expect(screen.getByLabelText("标题颜色")).not.toBeDisabled();
    });
    fireEvent.change(await screen.findByLabelText("标题颜色"), {
      target: { value: "#ffcc66" },
    });

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            appNameColor: "#ffcc66",
            useDefaultAppNameColor: false,
          },
        },
      );
    });

    fireEvent.click(screen.getByLabelText("通知背景色使用自定义"));
    await waitFor(() => {
      expect(screen.getByLabelText("通知背景色")).not.toBeDisabled();
    });
    fireEvent.change(screen.getByLabelText("通知背景色"), {
      target: { value: "#223344" },
    });

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            appNameColor: "#ffcc66",
            backgroundColor: "#223344",
            useDefaultAppNameColor: false,
            useDefaultBackgroundColor: false,
          },
        },
      );
    });

    fireEvent.click(screen.getByLabelText("标题颜色使用默认值"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            appNameColor: "",
            backgroundColor: "#223344",
            useDefaultAppNameColor: true,
            useDefaultBackgroundColor: false,
          },
        },
      );
    });

    fireEvent.click(screen.getByLabelText("通知背景色使用默认值"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            appNameColor: "",
            backgroundColor:
              DEFAULT_NOTIFICATION_CONFIG.desktop.backgroundColor,
            useDefaultAppNameColor: true,
            useDefaultBackgroundColor: true,
          },
        },
      );
    });
  });

  it("does not render QQ mail push controls in app notification settings", async () => {
    render(<NotificationSettings />);

    expect(await screen.findByText("桌面通知")).toBeInTheDocument();
    expect(screen.queryByText("QQ 邮箱推送")).not.toBeInTheDocument();
  });

  it("updates bottom action visibility and notification size preset", async () => {
    render(<NotificationSettings />);

    fireEvent.click(await screen.findByLabelText("显示底部操作"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        desktop: {
          ...DEFAULT_NOTIFICATION_CONFIG.desktop,
          showActions: false,
        },
      });
    });

    fireEvent.click(screen.getByLabelText("弹窗大小"));
    fireEvent.click(screen.getByRole("option", { name: "大" }));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            showActions: false,
            sizePreset: "large",
          },
        },
      );
    });
  });
});
