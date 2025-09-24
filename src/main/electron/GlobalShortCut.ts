import { globalShortcut } from "electron";
import { MainWindowManager } from "./MainWindow/MainWindow";
import { FloatingWindowManager } from "./FloateWindow";
let isVisible = false;
globalShortcut.register("Alt+Space", () => {
    MainWindowManager.toogleIsShowMainWindow();
    isVisible = !isVisible;
    if (isVisible) FloatingWindowManager.ShowAllFloatingWindows();
    else FloatingWindowManager.HideAllFloatingWindows();
});
globalShortcut.register('fn', () => {
  console.log('fn')
});
globalShortcut.register("F12", () => {
    MainWindowManager.toogleDevTools();
});           