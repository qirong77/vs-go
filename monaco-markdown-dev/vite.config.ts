import { defineConfig } from "vite";

export default defineConfig({
  root: "./monaco-markdown-dev",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: "../dist-monaco-dev",
  },
});
