import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // By default, only env variables prefixed with `MAIN_VITE_`,
  // `PRELOAD_VITE_` and `RENDERER_VITE_` are loaded,
  // unless the third parameter `prefixes` is changed.
  const env = loadEnv(mode);
  console.log(env);
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
