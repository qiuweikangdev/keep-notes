// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "D:\\misc\\demo\\keep-notes";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared")
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared")
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
