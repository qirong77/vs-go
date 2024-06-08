import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { VS_GO_EVENT } from '../../common/EVENT'

class MainWindow {
  window: BrowserWindow
  constructor() {
    this.window = this.createWindow()
  }
  createWindow() {
    const window = new BrowserWindow({
      width: 850,
      height: 600,
      show: true,
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      window.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
    // 在docker栏隐藏,支持浮动
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setAlwaysOnTop(true, 'floating', 1)
    window.on('show',()=>{
      window.webContents.send(VS_GO_EVENT.MAIN_WINDOW_SHOW)
    })
    window.on('blur',()=>{
      window.hide()
    })
    return window
  }
  show() {
    this.window.show()
    // showWindowOnCurrentDesktop(this.window)
    // this.window.center()
  }
  hide() {
    this.window.hide()
  }
  isVisible() {
    if (this.window.isDestroyed()) {
       this.window = this.createWindow()
       return false;
    }
    return this.window.isVisible()
  }
}
function showWindowOnCurrentDesktop(window: BrowserWindow) {
  const { x, y } = screen.getCursorScreenPoint()
  const currentDisplay = screen.getDisplayNearestPoint({ x, y })
  window.setPosition(currentDisplay.workArea.x, currentDisplay.workArea.y)
  window.show()
}
export default MainWindow
