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
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    installColorSchemeMedia();
    useUIStore.setState({ theme: "light" });
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
    ).toBe("#23272e");
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
