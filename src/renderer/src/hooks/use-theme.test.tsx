import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUIStore } from "@/store/ui.store";
import { useTheme } from "./use-theme";

function installColorSchemeMedia(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    ),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = {
        matches,
        media: mediaQuery.media,
      } as unknown as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    installColorSchemeMedia();
    useUIStore.setState({ theme: "light", layout: "classic" });
    localStorage.clear();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
    vi.restoreAllMocks();
  });

  it("keeps the editor color scheme in sync with an explicit theme update", () => {
    const { result } = renderHook(() => useTheme());

    act(() => useUIStore.getState().setTheme("dark"));

    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      document.documentElement.style.getPropertyValue("--bg-primary"),
    ).toBe("#23272f");
  });

  it("applies theme and layout as independent visual configurations", () => {
    useUIStore.setState({ theme: "minimal", layout: "minimal" });

    const { result } = renderHook(() => useTheme());

    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains("minimal")).toBe(true);
    expect(document.documentElement.dataset.layout).toBe("minimal");
    expect(
      document.documentElement.style.getPropertyValue(
        "--workspace-content-radius",
      ),
    ).toBe("0");
    expect(
      document.documentElement.style.getPropertyValue("--input-hover-border"),
    ).toBe("#55555a");
    expect(
      document.documentElement.style.getPropertyValue("--editor-code-block-bg"),
    ).toBe("#151517");
  });

  it("keeps the classic layout when only the theme changes", () => {
    useUIStore.setState({ theme: "minimal", layout: "classic" });

    renderHook(() => useTheme());

    expect(document.documentElement.dataset.layout).toBe("classic");
    expect(
      document.documentElement.style.getPropertyValue(
        "--workspace-content-radius",
      ),
    ).toBe("0");
  });

  it("keeps theme colors independent from layout and adapts the glass tint", () => {
    useUIStore.setState({ theme: "minimal", layout: "minimal" });
    const { result } = renderHook(() => useTheme());
    const root = document.documentElement;

    expect(root.style.getPropertyValue("--bg-primary")).toBe("#181818");
    expect(root.style.getPropertyValue("--bg-secondary")).toBe("#292929");
    expect(root.style.getPropertyValue("--file-tree-row-selected")).toBe(
      "#3a3a3d",
    );
    expect(result.current.config.colors.bgPrimary).toBe("#181818");

    act(() => useUIStore.getState().setTheme("light"));
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--sidebar-material-tint-opacity")).toBe(
      "96%",
    );

    act(() => useUIStore.setState({ theme: "dark", layout: "classic" }));
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#23272f");
    expect(root.style.getPropertyValue("--file-tree-row-selected")).toBe(
      "#383c44",
    );

    act(() => useUIStore.getState().setLayout("minimal"));
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#23272f");
    expect(root.style.getPropertyValue("--sidebar-material-tint")).toBe(
      "#303742",
    );
    expect(root.style.getPropertyValue("--sidebar-material-tint-opacity")).toBe(
      "70%",
    );

    act(() => useUIStore.setState({ theme: "nord", layout: "minimal" }));
    expect(root.style.getPropertyValue("--bg-primary")).toBe("#2e3440");
    expect(root.style.getPropertyValue("--sidebar-material-tint-opacity")).toBe(
      "78%",
    );
  });

  it("updates the resolved theme when the system color scheme changes", () => {
    const media = installColorSchemeMedia(false);
    useUIStore.setState({ theme: "system" });
    const { result } = renderHook(() => useTheme());

    act(() => media.setMatches(true));

    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps standalone floating windows transparent", () => {
    renderHook(() => useTheme({ transparentBackground: true }));

    expect(document.body.style.backgroundColor).toBe("transparent");
    expect(
      document.documentElement.style.getPropertyValue("--bg-primary"),
    ).toBe("#ffffff");
  });

  it("restores the application theme from shared persisted settings", () => {
    useUIStore.setState({ theme: "dark" });
    localStorage.setItem(
      "ui-storage",
      JSON.stringify({ state: { theme: "light" }, version: 0 }),
    );

    const { result } = renderHook(() =>
      useTheme({ transparentBackground: true }),
    );

    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("follows application theme changes from another window", () => {
    const { result } = renderHook(() =>
      useTheme({ transparentBackground: true }),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ui-storage",
          newValue: JSON.stringify({
            state: { theme: "dark" },
            version: 0,
          }),
        }),
      );
    });

    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("lets an isolated floating window follow the system theme", () => {
    const media = installColorSchemeMedia(true);
    localStorage.setItem("theme", "light");

    const { result } = renderHook(() =>
      useTheme({ transparentBackground: true, themeOverride: "system" }),
    );

    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("system");
    expect(localStorage.getItem("theme")).toBe("light");

    act(() => media.setMatches(false));

    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("light");
  });
});
