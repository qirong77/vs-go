import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export function getDefaultWorkSpaceFile() {
  const results: string[] = [];
  const zshrc = resolve(homedir(), ".zshrc");
  if (existsSync(zshrc)) {
    results.push(zshrc);
  }
  const zprofile = resolve(homedir(), ".zprofile");
  if (existsSync(zprofile)) {
    results.push(zprofile);
  }
  return results
}
