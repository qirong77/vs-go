import { readdirSync, statSync } from "fs";
import { resolve } from "node:path";
export async function getSubDirectory(path: string) {
  const subDirectories = await readdirSync(path)
    .filter((file) => !file.startsWith("."))
    .map((file) => resolve(path, file))
    .filter((file) => statSync(file).isDirectory());
  return subDirectories;
}
