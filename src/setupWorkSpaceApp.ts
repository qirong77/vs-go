import { app, dialog } from 'electron'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

interface WorkspaceApp {
  /** 用户可见名称（提示文案） */
  displayName: string
  /** .app 目录名 / open -a / 进程名 */
  bundleName: string
}

function workspaceApp(displayName: string, bundleName?: string): WorkspaceApp {
  return { displayName, bundleName: bundleName ?? displayName }
}

const AppList: WorkspaceApp[] = [
  workspaceApp('MonitorControl'),
  workspaceApp('Maccy'),
  workspaceApp('iShot Pro'),
  workspaceApp('UU远程', 'UURemote'),
]

const CHECK_INTERVAL = 60 * 60 * 1000

function appBundlePath(bundleName: string): string {
  return path.join('/Applications', `${bundleName}.app`)
}

function isAppInstalled({ bundleName }: WorkspaceApp): boolean {
  return fs.existsSync(appBundlePath(bundleName))
}

function isAppRunning({ bundleName }: WorkspaceApp): boolean {
  const result = spawnSync('pgrep', ['-x', bundleName], { timeout: 5000 })
  return result.status === 0
}

function launchApp({ displayName, bundleName }: WorkspaceApp): void {
  const result = spawnSync('open', [appBundlePath(bundleName)], { timeout: 10000 })
  if (result.status !== 0) {
    dialog.showErrorBox('启动失败', `无法启动 ${displayName}`)
  }
}

async function checkApps(): Promise<void> {
  const missingApps: string[] = []

  for (const entry of AppList) {
    if (!isAppInstalled(entry)) {
      missingApps.push(entry.displayName)
      continue
    }
    if (!isAppRunning(entry)) {
      launchApp(entry)
    }
  }

  if (missingApps.length > 0) {
    dialog.showMessageBox({
      type: 'warning',
      title: '应用未安装',
      message: `以下应用未安装：\n${missingApps.join('\n')}\n\n请安装后再使用。`,
      buttons: ['确定']
    })
  }
}

app.whenReady().then(() => {
  checkApps()
  setInterval(checkApps, CHECK_INTERVAL)
})
