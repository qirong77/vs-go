import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { VS_GO_EVENT } from '../../common/EVENT'


class MainWindow {
  private _window: BrowserWindow
  constructor() {
    this._window = this.createWindow()
  }
  createWindow() {
    this._window?.destroy()
    const window = new BrowserWindow({
      width: 850,
      height: 600,
      show: true,
      frame: is.dev ? true : false,
      autoHideMenuBar: is.dev ? false : true,
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
    window.setAlwaysOnTop(true, 'torn-off-menu', 999)
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
    this.window.focus()
    this.window.center()
    // showWindowOnCurrentDesktop(this.window)
    // this.window.center()
  }
  hide() {
    this._window.hide()
  }
  isVisible() {
    if (this._window.isDestroyed()) {
       this._window = this.createWindow()
       return false;
    }
    return this._window.isVisible()
  }
  get window() {
    return this._window
  }
}
function showWindowOnCurrentDesktop(window: BrowserWindow) {
  const { x, y } = screen.getCursorScreenPoint()
  const currentDisplay = screen.getDisplayNearestPoint({ x, y })
  window.setPosition(currentDisplay.workArea.x, currentDisplay.workArea.y)
  window.show()
}
export default MainWindow
