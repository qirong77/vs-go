import { globalShortcut } from 'electron'
import MainWindow from './MainWindow'

class VsGoGlobalShortCut {
  constructor(mainWindow: MainWindow) {
    // globalShortcut.register('Alt+Space', () => {
    //   mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    // })
    globalShortcut.register('Ctrl+Space', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    })
  }
}
export default VsGoGlobalShortCut
