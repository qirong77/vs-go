import {resolve} from 'path'
import { homedir } from 'os';
const vsGoConfig = {
  workSpaceDirectories: ['/Users/qironglin/Desktop/Projects'],
  codeCommandPath: "/usr/local/bin/code",
  vscodeStausFilePath:resolve(homedir(), "Desktop", ".qirong-vscode-window-status.json")
};
export { vsGoConfig };
