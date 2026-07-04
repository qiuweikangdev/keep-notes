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

    const input = await screen.findByLabelText("应用名");
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

  it("places the app name setting below persistent display", async () => {
    render(<NotificationSettings />);

    const persistentLabel = await screen.findByText("持续显示");
    const titleLabel = screen.getByText("应用名");

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

  it("updates desktop notification app name font size in custom appearance mode", async () => {
    render(<NotificationSettings />);

    fireEvent.click(await screen.findByLabelText("样式使用自定义"));

    await waitFor(() => {
      expect(screen.getByLabelText("应用名大小")).not.toBeDisabled();
    });

    const input = screen.getByLabelText("应用名大小");
    fireEvent.change(input, { target: { value: "22" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: true,
            appNameFontSize: 22,
          },
        },
      );
    });
  });

  it("switches between default and custom appearance modes", async () => {
    render(<NotificationSettings />);

    expect(screen.getByLabelText("样式使用默认值")).toBeChecked();
    expect(screen.queryByLabelText("应用名大小")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("应用标题颜色")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("标题大小")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("标题颜色")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("通知背景色")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("弹窗大小")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("样式使用自定义"));
    await waitFor(() => {
      expect(screen.getByLabelText("样式使用自定义")).toBeChecked();
      expect(screen.getByLabelText("应用名大小")).toBeInTheDocument();
      expect(screen.getByLabelText("应用标题颜色")).toBeInTheDocument();
      expect(screen.getByLabelText("标题大小")).toBeInTheDocument();
      expect(screen.getByLabelText("标题颜色")).toBeInTheDocument();
      expect(screen.getByLabelText("通知背景色")).toBeInTheDocument();
      expect(screen.getByLabelText("弹窗大小")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: true,
            appNameFontSize: 18,
            appNameColor: "#111827",
            titleFontSize: 21,
            titleColor: "#111827",
            backgroundColor: "#ece6f3",
            sizePreset: "medium",
          },
        },
      );
    });
    expect(screen.getByLabelText("选择应用标题颜色取色器")).toHaveAttribute(
      "type",
      "color",
    );
    expect(screen.getByLabelText("选择应用标题颜色取色器")).toHaveClass(
      "sr-only",
    );
    expect(screen.getByLabelText("选择标题颜色取色器")).toHaveAttribute(
      "type",
      "color",
    );
    expect(screen.getByLabelText("选择标题颜色取色器")).toHaveClass("sr-only");
    expect(screen.getByLabelText("选择通知背景色取色器")).toHaveAttribute(
      "type",
      "color",
    );
    expect(screen.getByLabelText("选择通知背景色取色器")).toHaveClass(
      "sr-only",
    );
    expect(
      screen.getByRole("button", { name: "选择应用标题颜色" }),
    ).toHaveAttribute("data-color-swatch", "true");

    fireEvent.change(screen.getByLabelText("应用名大小"), {
      target: { value: "22" },
    });
    fireEvent.blur(screen.getByLabelText("应用名大小"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        desktop: {
          ...DEFAULT_NOTIFICATION_CONFIG.desktop,
          useCustomAppearance: true,
          appNameFontSize: 22,
        },
      });
    });

    fireEvent.change(await screen.findByLabelText("应用标题颜色"), {
      target: { value: "#ffcc66" },
    });

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: true,
            appNameFontSize: 22,
            appNameColor: "#ffcc66",
          },
        },
      );
    });

    fireEvent.change(screen.getByLabelText("标题大小"), {
      target: { value: "24" },
    });
    fireEvent.blur(screen.getByLabelText("标题大小"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: true,
            appNameFontSize: 22,
            appNameColor: "#ffcc66",
            titleFontSize: 24,
          },
        },
      );
    });

    fireEvent.change(screen.getByLabelText("标题颜色"), {
      target: { value: "#66ccff" },
    });

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: true,
            appNameFontSize: 22,
            appNameColor: "#ffcc66",
            titleFontSize: 24,
            titleColor: "#66ccff",
          },
        },
      );
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
            useCustomAppearance: true,
            appNameFontSize: 22,
            appNameColor: "#ffcc66",
            titleFontSize: 24,
            titleColor: "#66ccff",
            backgroundColor: "#223344",
          },
        },
      );
    });

    fireEvent.click(screen.getByLabelText("弹窗大小"));
    fireEvent.click(screen.getByRole("option", { name: "大" }));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: true,
            appNameFontSize: 22,
            appNameColor: "#ffcc66",
            titleFontSize: 24,
            titleColor: "#66ccff",
            backgroundColor: "#223344",
            sizePreset: "large",
          },
        },
      );
    });

    fireEvent.click(screen.getByLabelText("样式使用默认值"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith(
        {
          ...DEFAULT_NOTIFICATION_CONFIG,
          desktop: {
            ...DEFAULT_NOTIFICATION_CONFIG.desktop,
            useCustomAppearance: false,
          },
        },
      );
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("应用名大小")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("应用标题颜色")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("标题大小")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("标题颜色")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("通知背景色")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("弹窗大小")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByLabelText("样式使用自定义"));
    await waitFor(() => {
      expect(screen.getByLabelText("弹窗大小")).toBeInTheDocument();
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
            useCustomAppearance: true,
            sizePreset: "large",
          },
        },
      );
    });
  });
});
