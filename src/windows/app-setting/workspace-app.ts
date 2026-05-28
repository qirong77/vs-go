import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { appSettingStore } from './store'
import type { WorkspaceApp } from '@shared/type'

export function workspaceApp(displayName: string, bundleName?: string): WorkspaceApp {
  return { displayName, bundleName: bundleName ?? displayName }
}

export const DEFAULT_WORKSPACE_APPS: WorkspaceApp[] = [
  workspaceApp('MonitorControl'),
  workspaceApp('Maccy'),
  workspaceApp('iShot Pro'),
  workspaceApp('UU远程', 'UURemote'),
]

const CHECK_INTERVAL = 15 * 60 * 1000

function appBundlePath(bundleName: string): string {
  return path.join('/Applications', `${bundleName}.app`)
}

export function isAppInstalled({ bundleName }: WorkspaceApp): boolean {
  return fs.existsSync(appBundlePath(bundleName))
}

export function isAppRunning({ bundleName }: WorkspaceApp): boolean {
  const result = spawnSync('pgrep', ['-x', bundleName], { timeout: 5000 })
  return result.status === 0
}

function launchApp({ bundleName }: WorkspaceApp): void {
  spawnSync('open', [appBundlePath(bundleName)], { timeout: 10000 })
}

function getUserApps(): WorkspaceApp[] {
  try {
    return appSettingStore.getWorkspaceApps()
  } catch {
    return []
  }
}

export function checkAllApps(): void {
  const allApps = [...DEFAULT_WORKSPACE_APPS, ...getUserApps()]

  for (const entry of allApps) {
    if (!isAppInstalled(entry)) continue
    if (!isAppRunning(entry)) {
      launchApp(entry)
    }
  }
}

let checkTimer: ReturnType<typeof setInterval> | null = null

export function startWorkspaceAppChecker(): void {
  checkAllApps()
  checkTimer = setInterval(checkAllApps, CHECK_INTERVAL)
}

export function stopWorkspaceAppChecker(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
