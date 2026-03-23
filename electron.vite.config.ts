import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  loadEnv(mode);

  return {
    main: {
      envPrefix: "M_VITE_",
      plugins: [externalizeDepsPlugin()],
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
      build: {
        lib: {
          entry: resolve(__dirname, "src/preload/index.tsx"),
        },
      },
    },
    renderer: {
      resolve: {
        alias: {
          "@renderer": resolve("src/renderer/src"),
        },
      },
      plugins: [react()],
    },
  };
});
