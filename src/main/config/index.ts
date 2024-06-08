import {resolve} from 'path'
import { homedir } from 'os';
const vsGoConfig = {
  workSpaceDirectories: ["/Users/qironglin/Desktop/Projects/kwaishou-projects/","/Users/qironglin/Desktop"],
  codeCommandPath: "/usr/local/bin/code",
  vscodeStausFilePath:resolve(homedir(), "Desktop", ".qirong-vscode-window-status.json")
};
export { vsGoConfig };
