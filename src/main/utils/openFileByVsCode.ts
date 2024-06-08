import { vsGoConfig } from "../config";
import {exec} from 'child_process'
export function openFileByVscode(filePath: string) {
  exec(`${vsGoConfig.codeCommandPath}  --new-window "${filePath}"`, (error) => {
    if (error) {
      dialog.showErrorBox("error", JSON.stringify(error));
    }
  });
}
