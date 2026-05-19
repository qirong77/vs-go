import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export function getSubDirectory(dirPath: string): string[] {
  try {
    return readdirSync(dirPath)
      .filter((file) => !file.startsWith("."))
      .map((file) => resolve(dirPath, file))
      .filter((file) => {
        try {
          return statSync(file).isDirectory();
        } catch {
          return false;
        }
      });
  } catch (error) {
    console.error(`Failed to read directory: ${dirPath}`, error);
    return [];
  }
}
