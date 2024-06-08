import { execSync } from "child_process";

export function getExecString(command = "") {
  try {
    return execSync(command).toString();
  } catch {
    throw new Error("");
  }
}
