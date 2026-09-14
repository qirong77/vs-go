import { TabbedBrowserWindow } from "./TabbedBrowserWindow";

/**
 * 「远程浏览器控制」专属窗口。
 * 继承 TabbedBrowserWindow 的能力（单页 WebContentsView、IPC、远程调试桥接），
 * 但以 remoteControl 模式创建：紧凑横幅外壳 + 专属渲染路由，
 * 与普通多标签浏览器窗口在视觉与行为上完全隔离。
 */
export class RemoteBrowserControlWindow extends TabbedBrowserWindow {
  constructor(clientId?: string) {
    super({ remoteControl: true, clientId });
  }

  /**
   * 远程控制窗口应尽量保持前台/激活态：
   * 底层 present() 在 macOS 上用 showInactive()（不抢焦点），会导致窗口失焦、
   * 红绿灯与横幅暗淡；这里显式 show()+focus() 激活窗口，让“正在被操作”状态始终醒目。
   */
  override present(): void {
    super.present();
    if (!this.hostWindow.isDestroyed()) {
      this.hostWindow.show();
      this.hostWindow.focus();
    }
  }
}
