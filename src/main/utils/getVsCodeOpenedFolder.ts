import { vsGoConfig } from "../config/index.ts";
import { getExecString } from "./getExecString.ts";

export function getVsCodeOpenedFolder() {
    const codeStatus = getExecString(`${vsGoConfig.codeCommandPath} -s`)
    return getWindowFiles(codeStatus)
}
/* 
|  Window (test.mjs — draft)
|  Window (kwai-code-editor)
|  Window (run.ts — my-commands)
|  Window (aapl-line-slider-transposed.ts — G2-5)
|  Window (index.vue — kuaishou-frontend-idp)
*/
function getWindowFiles(vscodeStatus = "") {
  const regex = /^\|  Window \(([^—]+) — ([^\)]+)\)/;
  const windows = vscodeStatus
    .split("\n")
    .filter((line) => regex.test(line))
    .map((line) => {
      const matches = line.match(regex);
      const file = matches[1];
      const folder = matches[2];
      return {
        file,
        folder,
      };
    });
  
  return windows;
}
