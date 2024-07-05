import { resolve } from 'path'
import { homedir } from 'os'
const ProjectPath = resolve(homedir(), 'Desktop', 'Projects')
const vsGoConfig = {
  workSpaceDirectories: [ProjectPath, resolve(homedir(), 'Desktop')],
  codeCommandPath: '/usr/local/bin/code',
  vscodeStausFilePath: resolve(homedir(), 'Desktop', '.qirong-vscode-window-status.json')
}
export { vsGoConfig }
