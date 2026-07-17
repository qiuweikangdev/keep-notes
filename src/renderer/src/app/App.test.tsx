import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReminderStore } from "@/store/reminder.store";
import type { Reminder } from "@/types";
import { editorFindController } from "@/features/editor/lib/editor-find-controller";

let menuActionHandler: ((action: string) => void) | null = null;
const appMocks = vi.hoisted(() => ({
  openQuickEditorDraft: vi.fn(),
  incrementTabReloadKey: vi.fn(),
  setActiveTab: vi.fn(),
  setTabContent: vi.fn(),
  syncFileContent: vi.fn(),
}));

const triggeredReminder: Reminder = {
  id: "reminder-1",
  title: "Triggered reminder",
  filePath: "/workspace/notes/today.md",
  fileName: "today.md",
  scheduledAt: "2026-06-21T09:00:00.000Z",
  repeat: "never",
  completed: false,
  createdAt: "2026-06-21T08:00:00.000Z",
  updatedAt: "2026-06-21T08:00:00.000Z",
};

vi.mock("react-resizable-panels", () => {
  const React = require("react");

  const Panel = React.forwardRef(
    (
      {
        children,
        onCollapse,
        onExpand,
        onDidMount,
      }: {
        children: React.ReactNode;
        onCollapse?: () => void;
        onExpand?: () => void;
        onDidMount?: (panel: {
          collapse: () => void;
          expand: () => void;
          isCollapsed: () => boolean;
        }) => void;
      },
      ref,
    ) => {
      const [collapsed, setCollapsed] = React.useState(false);

      const panelApi = {
        collapse: () => {
          setCollapsed(true);
          onCollapse?.();
        },
        expand: () => {
          setCollapsed(false);
          onExpand?.();
        },
        isCollapsed: () => collapsed,
      };

      React.useImperativeHandle(ref, () => panelApi, [collapsed]);

      React.useEffect(() => {
        onDidMount?.(panelApi);
      }, []);

      return (
        <div data-testid="sidebar-panel" data-collapsed={collapsed}>
          {!collapsed ? children : null}
        </div>
      );
    },
  );

  return {
    Panel,
    PanelGroup: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    PanelResizeHandle: () => <div />,
  };
});

vi.mock("@/pages/home", async () => {
  const { Panel, PanelGroup } = await import("react-resizable-panels");
  const { usePanel } =
    await vi.importActual<typeof import("@/hooks/use-panel")>(
      "@/hooks/use-panel",
    );

  function MockHomePage() {
    const {
      panelRef,
      collapsed,
      toggleCollapse,
      handleCollapse,
      handleExpand,
      handleDidMount,
    } = usePanel();

    return (
      <div>
        <button onClick={toggleCollapse}>切换侧边栏按钮</button>
        <div data-testid="sidebar-state">
          {collapsed ? "collapsed" : "expanded"}
        </div>
        <PanelGroup direction="horizontal">
          <Panel
            ref={panelRef}
            id="sidebar"
            collapsible
            collapsedSize={0}
            defaultSize={25}
            minSize={15}
            onCollapse={handleCollapse}
            onExpand={handleExpand}
            onDidMount={handleDidMount}
          >
            <div>Sidebar</div>
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  return { HomePage: MockHomePage };
});

vi.mock("@/features/settings", async () => {
  const { useDragResize } = await vi.importActual<
    typeof import("@/components/drag-resize-provider")
  >("@/components/drag-resize-provider");

  return {
    SettingsModal: () => {
      const { isIdle } = useDragResize();
      return (
        <div data-testid="application-dialog-provider-state">
          {String(isIdle)}
        </div>
      );
    },
  };
});

vi.mock("@/features/search", () => ({
  SearchModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div aria-label="Global search" role="dialog" /> : null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    openFolder: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@/store/tree.store", () => ({
  useTreeStore: Object.assign(
    <T,>(selector?: (state: { treeRoot: null; treeData: never[] }) => T) => {
      const state = { treeRoot: null, treeData: [] };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({ treeRoot: null, treeData: [] }),
    },
  ),
}));

vi.mock("@/store/ui.store", () => ({
  useUIStore: Object.assign(
    <T,>(
      selector?: (state: {
        isSettingsOpen: boolean;
        setSettingsOpen: (open: boolean) => void;
      }) => T,
    ) => {
      const state = {
        isSettingsOpen: false,
        setSettingsOpen: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        isSettingsOpen: false,
        setSettingsOpen: vi.fn(),
      }),
    },
  ),
}));

vi.mock("@/store/editor.store", () => ({
  useEditorStore: Object.assign(
    <T,>(
      selector?: (state: {
        appearance: {
          codeFont: string;
          opacity: number;
          uiFont: string;
          uiFontSize: number;
        };
        filePath: string | null;
        content: string;
        panelGroups: never[];
        activeGroupId: string;
        setFilePath: (path: string | null) => void;
        resetEditor: () => void;
        removeTab: (groupId: string, tabId?: string) => void;
      }) => T,
    ) => {
      const state = {
        appearance: {
          codeFont: '"SF Mono", monospace',
          opacity: 100,
          uiFont: '"Inter", sans-serif',
          uiFontSize: 15,
        },
        filePath: null,
        content: "",
        panelGroups: [{ id: "group-1", activeTabId: "tab-1" }],
        activeGroupId: "group-1",
        setFilePath: vi.fn(),
        resetEditor: vi.fn(),
        removeTab: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        openQuickEditorDraft: appMocks.openQuickEditorDraft,
        incrementTabReloadKey: appMocks.incrementTabReloadKey,
        setActiveTab: appMocks.setActiveTab,
        setTabContent: appMocks.setTabContent,
        syncFileContent: appMocks.syncFileContent,
        activeGroupId: "group-1",
        panelGroups: [
          {
            id: "group-1",
            activeTabId: "tab-1",
            tabs: [
              {
                id: "tab-1",
                filePath: "/workspace/notes/today.md",
                content: "# Previous draft",
                mode: "rich",
              },
            ],
          },
        ],
        setFilePath: vi.fn(),
        setDirty: vi.fn(),
      }),
    },
  ),
}));

vi.mock("@/store/shortcuts.store", () => ({
  useShortcutsStore: Object.assign(
    <T,>(
      selector?: (state: {
        shortcuts: Array<{ id: string; keys: string[] }>;
      }) => T,
    ) => {
      const state = {
        shortcuts: [
          { id: "toggleSidebar", keys: ["CmdOrCtrl+Shift+B"] },
          { id: "toggleTheme", keys: ["CmdOrCtrl+Shift+L"] },
          { id: "openSearch", keys: ["CmdOrCtrl+P"] },
          { id: "openSearchAlt", keys: ["CmdOrCtrl+Shift+F"] },
        ],
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        shortcuts: [
          { id: "toggleSidebar", keys: ["CmdOrCtrl+Shift+B"] },
          { id: "toggleTheme", keys: ["CmdOrCtrl+Shift+L"] },
          { id: "openSearch", keys: ["CmdOrCtrl+P"] },
          { id: "openSearchAlt", keys: ["CmdOrCtrl+Shift+F"] },
        ],
      }),
    },
  ),
}));

import { App } from "./App";

describe("App shortcuts", () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1,
    });
    document.documentElement.style.removeProperty(
      "--editor-code-block-cursor-width",
    );
  });

  beforeEach(() => {
    menuActionHandler = null;
    appMocks.openQuickEditorDraft.mockClear();
    appMocks.incrementTabReloadKey.mockClear();
    appMocks.setActiveTab.mockClear();
    appMocks.setTabContent.mockClear();
    appMocks.syncFileContent.mockClear();
    useReminderStore.setState({
      reminders: [],
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
      isListOpen: false,
      triggeredReminder: null,
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
        getZoomFactor: vi.fn(async () => 1),
        listReminders: vi.fn(async () => []),
        onRemindersChanged: vi.fn(() => () => undefined),
        onReminderTriggered: vi.fn(() => () => undefined),
        consumeQuickEditorContent: vi.fn(async () => null),
        onQuickEditorContentImported: vi.fn(() => () => undefined),
        onMenuAction: (callback: (action: string) => void) => {
          menuActionHandler = callback;
          return () => {
            menuActionHandler = null;
          };
        },
      },
    });
  });

  it("provides drag and resize state to application-level dialogs", () => {
    render(<App />);

    expect(
      screen.getByTestId("application-dialog-provider-state"),
    ).toHaveTextContent("true");
  });

  it("consumes quick-editor content into the active unnamed tab", async () => {
    const consumeQuickEditorContent = vi.fn(async () => ({
      content: "# Quick draft\n",
      source: null,
    }));
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { ...window.electronAPI, consumeQuickEditorContent },
    });

    render(<App />);

    await waitFor(() => {
      expect(appMocks.openQuickEditorDraft).toHaveBeenCalledWith(
        "# Quick draft\n",
      );
    });
  });

  it("restores the source file tab when returning from a floating editor", async () => {
    const onQuickEditorContentImported = vi.fn(
      (
        callback: (content: {
          content: string;
          source: {
            groupId: string;
            tabId: string;
            filePath: string | null;
          } | null;
        }) => void,
      ) => {
        callback({
          content: "# Updated in floating editor",
          source: {
            groupId: "group-1",
            tabId: "tab-1",
            filePath: "/workspace/notes/today.md",
          },
        });
        return () => undefined;
      },
    );
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { ...window.electronAPI, onQuickEditorContentImported },
    });

    render(<App />);

    await waitFor(() => {
      expect(appMocks.setTabContent).toHaveBeenCalledWith(
        "group-1",
        "tab-1",
        "# Updated in floating editor",
      );
      expect(appMocks.setActiveTab).toHaveBeenCalledWith("group-1", "tab-1");
      expect(appMocks.syncFileContent).toHaveBeenCalledWith(
        "/workspace/notes/today.md",
        "# Updated in floating editor",
        "tab-1",
      );
      expect(appMocks.incrementTabReloadKey).toHaveBeenCalledWith(
        "group-1",
        "tab-1",
      );
    });
    expect(appMocks.openQuickEditorDraft).not.toHaveBeenCalled();
  });

  it("keeps the code-block cursor at two visual pixels across interface zoom", async () => {
    const getZoomFactor = vi.fn(async () => 0.5);
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { ...window.electronAPI, getZoomFactor },
    });

    render(<App />);

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(
          "--editor-code-block-cursor-width",
        ),
      ).toBe("4px");
    });

    getZoomFactor.mockResolvedValueOnce(1);
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(
          "--editor-code-block-cursor-width",
        ),
      ).toBe("2px");
    });
  });

  it("allows the page button to toggle the mounted sidebar panel", () => {
    render(<App />);

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    fireEvent.click(screen.getByRole("button", { name: "切换侧边栏按钮" }));

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("toggles the same sidebar when pressing Cmd+Shift+B", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "b", metaKey: true, shiftKey: true });

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("leaves Cmd+B available for editor bold formatting", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });

  it("opens file search for the active editor when pressing Cmd+F", () => {
    const openEditorFind = vi.spyOn(editorFindController, "open");
    render(<App />);

    fireEvent.keyDown(window, { key: "f", metaKey: true });

    expect(openEditorFind).toHaveBeenCalledWith("group-1", "tab-1");
    openEditorFind.mockRestore();
  });

  it("opens global search when receiving the title bar search event", () => {
    render(<App />);

    act(() => {
      window.dispatchEvent(new Event("open-search"));
    });

    expect(
      screen.getByRole("dialog", { name: "Global search" }),
    ).toBeInTheDocument();
  });

  it("toggles the same sidebar when receiving the menu action", () => {
    render(<App />);

    act(() => {
      menuActionHandler?.("toggleSidebar");
    });

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("does not apply editor typography settings to the document", () => {
    document.documentElement.style.fontSize = "";
    document.body.style.fontFamily = "";

    render(<App />);

    expect(document.documentElement.style.fontSize).toBe("");
    expect(document.body.style.fontFamily).toBe("");
  });

  it("does not render in-app reminder notifications by default", () => {
    useReminderStore.setState({ triggeredReminder });

    render(<App />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
