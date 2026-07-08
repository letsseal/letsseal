import { promises as fs } from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "storage");

export async function saveFile(key: string, data: Buffer): Promise<string> {
  const full = path.join(ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(path.join(ROOT, key));
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await fs.access(path.join(ROOT, key));
    return true;
  } catch {
    return false;
  }
}
