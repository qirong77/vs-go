import { BrowserWindow } from "electron";
import path from "node:path";

export function createFloatingWindowNew(url = "https://www.zhihu.com/") {
//   const floatingWindow = new BrowserWindow({
//     width: 1200,
//     height: 800,
//     webPreferences: {
//       sandbox: false,
//       preload: path.join(__dirname, "../preload/index.js"),
//     },
//   });
//   floatingWindow.loadURL(url);
//   floatingWindow.setVisibleOnAllWorkspaces(true, {
//     visibleOnFullScreen: true, // 允许在全屏应用上显示
//   });
//   floatingWindow.webContents.on("before-input-event", (_event, input) => {
//     if (
//       input.modifiers.includes("meta") &&
//       input.modifiers.includes("alt") &&
//       input.key.toLowerCase() === "i"
//     ) {
//       floatingWindow.webContents.toggleDevTools();
//     }
//   });
//   floatingWindow.center();
//   floatingWindow.show();
//   return floatingWindow;
}
setTimeout(()=>{
// createFloatingWindowNew()
},10000)