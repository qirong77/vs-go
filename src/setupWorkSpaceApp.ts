import { app, dialog } from 'electron'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const AppList = ['MonitorControl', 'Maccy', 'iShot Pro', 'UU远程']

const CHECK_INTERVAL = 10 * 60 * 1000

function isAppInstalled(appName: string): boolean {
  return fs.existsSync(path.join('/Applications', `${appName}.app`))
}

function isAppRunning(appName: string): boolean {
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events" to (name of processes) contains "${appName}"'`,
      { encoding: 'utf-8', timeout: 5000 }
    )
    return result.trim() === 'true'
  } catch {
    return false
  }
}

function launchApp(appName: string): void {
  try {
    execSync(`open -a "${appName}"`, { timeout: 10000 })
  } catch (e) {
    dialog.showErrorBox('启动失败', `无法启动 ${appName}`)
  }
}

async function checkApps(): Promise<void> {
  const missingApps: string[] = []

  for (const appName of AppList) {
    if (!isAppInstalled(appName)) {
      missingApps.push(appName)
      continue
    }
    if (!isAppRunning(appName)) {
      launchApp(appName)
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
//   checkApps()
//   setInterval(checkApps, CHECK_INTERVAL)
})
