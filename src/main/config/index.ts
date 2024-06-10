import {resolve} from 'path'
import { homedir } from 'os';
const vsGoConfig = {
  workSpaceDirectories: ["/Users/qironglin/Desktop/Projects/kwaishou-projects","/Users/qironglin/Desktop/",'/Users/qironglin/Desktop/Projects/my-projects'],
  codeCommandPath: "/usr/local/bin/code",
  vscodeStausFilePath:resolve(homedir(), "Desktop", ".qirong-vscode-window-status.json")
};
export { vsGoConfig };
