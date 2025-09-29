import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import ReactDOM from "react-dom/client"
import PreLoadComponent from './PreloadComponent/PreloadComponent'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

window.addEventListener('load', () => {
  const root = document.createElement('div') as HTMLElement;
  root.id = 'preload-root';
  document.body.insertBefore(root, document.body.firstChild);
  ReactDOM.createRoot(root).render(<PreLoadComponent />);
})