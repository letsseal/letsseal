import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function poolSize(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const cores = (() => {
    try { return require("node:os").availableParallelism?.() ?? require("node:os").cpus().length; }
    catch { return 4; }
  })();
  return Math.min(Math.max(cores * 2 + 1, 5), 20);
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (see web/.env.example)");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: poolSize() }),
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
