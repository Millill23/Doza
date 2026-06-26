import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * @prisma/client не загружает .env автоматически (это делает только Prisma CLI).
 * Подгружаем ближайший .env, поднимаясь от текущей рабочей директории к корню,
 * если DATABASE_URL ещё не задан в окружении.
 */
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  // @ts-ignore — доступно в Node >= 20.12
  if (typeof process.loadEnvFile !== "function") return;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      try {
        // @ts-ignore
        process.loadEnvFile(candidate);
      } catch {
        /* ignore */
      }
      if (process.env.DATABASE_URL) return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadEnv();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
