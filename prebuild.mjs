import { existsSync } from "node:fs";

const hasTrayIconInOut = existsSync("./out/rocket-takeoff@2x.png");
if (hasTrayIconInOut) {
  console.log("缺少资源文件，无法启动，请检查是否缺少资源文件  ./out/rocket-takeoff@2x.png");
  process.exit(1);
}
