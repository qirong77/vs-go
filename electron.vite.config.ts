import { resolve } from "path";
import { copyFileSync, existsSync } from "fs";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

/**
 * 将 build/ 中的 tray 图标拷贝到 out/ 目录，
 * 确保打包后 main 进程能通过相对路径找到图标文件。
 */
function copyTrayIconPlugin(): Plugin {
  return {
    name: "copy-tray-icon",
    closeBundle() {
      const src = resolve(__dirname, "build/rocket-takeoff@2x.png");
      const dest = resolve(__dirname, "out/rocket-takeoff@2x.png");
      if (existsSync(src)) {
        copyFileSync(src, dest);
      } else {
        console.warn("[copy-tray-icon] build/rocket-takeoff@2x.png not found, skipping.");
      }
    },
  };
}

const pathAliases = {
  "@shared": resolve("src/shared"),
  "@platform": resolve("src/platform"),
  "@windows": resolve("src/windows"),
  "@config": resolve("src/config"),
  "@utils": resolve("src/utils"),
  "@renderer": resolve("src/platform/renderer"),
};

export default defineConfig(({ mode }) => {
  loadEnv(mode);

  return {
    main: {
      envPrefix: "M_VITE_",
      plugins: [externalizeDepsPlugin(), copyTrayIconPlugin()],
      resolve: {
        alias: pathAliases,
      },
      build: {
        rollupOptions: {
          output: {
            format: "es",
          },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin(), react()],
      resolve: {
        alias: pathAliases,
      },
      build: {
        lib: {
          entry: resolve(__dirname, "src/platform/preload/index.tsx"),
        },
      },
    },
    renderer: {
      root: resolve(__dirname, "src/platform/renderer"),
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, "src/platform/renderer/index.html"),
            terminal: resolve(__dirname, "src/platform/renderer/terminal.html"),
          },
        },
      },
      resolve: {
        alias: pathAliases,
      },
      plugins: [react()],
    },
  };
});
