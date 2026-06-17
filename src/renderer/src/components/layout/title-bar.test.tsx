import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TitleBar } from "./title-bar";

vi.mock("@/store/ui.store", () => ({
  useUIStore: () => ({
    setSettingsOpen: vi.fn(),
  }),
}));

vi.mock("@/store/editor.store", () => ({
  useEditorStore: () => ({
    appearance: {
      showFileHistoryNavigation: true,
    },
  }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    isDark: true,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@/features/search", () => ({
  SearchModal: () => null,
}));

vi.mock("@/features/git", () => ({
  GitPanel: () => null,
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    detectGitRepo: vi.fn().mockResolvedValue({
      code: "success",
      data: { isGitRepo: false },
    }),
    openFile: vi.fn(),
  }),
}));

vi.mock("@/store/tree.store", () => ({
  useTreeStore: () => ({
    treeRoot: null,
  }),
}));

describe("TitleBar", () => {
  it("在 macOS 下保持统一的标题栏高度，并让左侧原生按钮占位撑满整行", () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
      },
    });

    render(<TitleBar collapsed={false} onToggleCollapse={vi.fn()} />);

    expect(screen.getByTestId("title-bar")).toHaveStyle({ height: "40px" });
    expect(screen.getByTestId("mac-traffic-light-spacer")).toHaveClass(
      "h-full",
    );
  });
});
