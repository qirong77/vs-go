import { globalShortcut } from "electron";
import MainWindow from "./MainWindow";

class VsGoGlobalShortCut {
  constructor(mainWindow: MainWindow) {
    globalShortcut.register('Alt+Space', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    })
    globalShortcut.register("F12", () => {
      mainWindow.window.isVisible() && mainWindow.window.webContents.toggleDevTools();
    });
  }
}
export default VsGoGlobalShortCut;
