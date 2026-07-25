import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function loadDotEnv() {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  let contents;
  try {
    contents = readFileSync(join(webRoot, ".env"), "utf8");
  } catch {
    return; 
  }
  for (const line of contents.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadDotEnv();

export function prismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set: put it in web/.env, or export it (see web/.env.example)");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
