import { readdirSync, statSync } from "fs";
import { resolve } from "node:path";
export function getSubDirectory(path: string) {
  const subDirectories = readdirSync(path)
    .filter((file) => !file.startsWith("."))
    .map((file) => resolve(path, file))
    .filter((file) => statSync(file).isDirectory());
  return subDirectories;
}
