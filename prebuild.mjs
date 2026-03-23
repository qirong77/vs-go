import { existsSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "build/rocket-takeoff@2x.png");
const dest = resolve(__dirname, "out/rocket-takeoff@2x.png");

if (!existsSync(src)) {
  console.error("缺少资源文件: build/rocket-takeoff@2x.png，请确认 build/ 目录完整");
  process.exit(1);
}

copyFileSync(src, dest);
console.log("已拷贝 tray 图标到 out/rocket-takeoff@2x.png");
