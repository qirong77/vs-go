import { app } from 'electron'
import VsGoTray from './Tray'
import MainWindow from './MainWindow'
import VsGoGlobalShortCut from './GlobalShortCut'

app.whenReady().then(() => {
  const window = new MainWindow()
  window.show()
  new VsGoGlobalShortCut(window)
  new VsGoTray()
})
