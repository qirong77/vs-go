import { execSync } from "node:child_process";

export function getExecString(command: string): string {
  try {
    return execSync(command).toString();
  } catch (error) {
    console.error(`Command execution failed: ${command}`, error);
    return "";
  }
}
