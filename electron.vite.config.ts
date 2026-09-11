import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  renderer: {
    resolve: {
      alias: [
        {
          find: "@",
          replacement: resolve(__dirname, "src/renderer/src"),
        },
        { find: "@shared", replacement: resolve(__dirname, "src/shared") },
        // Pierre Diffs 默认引用 Shiki 全量语言与主题；替换为应用实际支持的精简入口。
        {
          find: /^shiki$/,
          replacement: resolve(
            __dirname,
            "src/renderer/src/lib/shiki-bundle.ts",
          ),
        },
      ],
    },
    plugins: [react()],
  },
});
