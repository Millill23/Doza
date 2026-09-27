import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@doza/db";
import { isSoldOut } from "@doza/db/stock-rules";
import { handler, ok } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Что на самом деле работает на этом сервере.
 *
 * Появилась после истории, в которой пиксель был в коде, в образе и в
 * контейнере, но не на сайте: nginx держал адрес старого контейнера и отдавал
 * прошлую версию. Искали полдня. Один запрос сюда показал бы задеплоенный
 * коммит и закрыл бы вопрос сразу.
 *
 * Переменные окружения отдаём только как «задана или нет». Значения – никогда:
 * иначе ручка превращается в способ вытащить ключ платёжного шлюза.
 */

/** Задана ли переменная. Пустая строка считается незаданной. */
function has(name: string): boolean {
  return Boolean((process.env[name] ?? "").trim());
}

/** Применённые и лежащие в репозитории миграции. Расхождение – повод бить тревогу. */
async function migrations(): Promise<{
  applied: number;
  onDisk: number;
  pending: string[];
  error?: string;
}> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `select migration_name from _prisma_migrations where finished_at is not null`,
    );
    const applied = new Set(rows.map((r) => r.migration_name));

    // Папка миграций рядом со схемой. В рантайм-образе CRM её может не быть –
    // тогда просто не с чем сравнивать, и это не ошибка.
    let onDisk: string[] = [];
    for (const dir of [
      join(process.cwd(), "packages/db/prisma/migrations"),
      join(process.cwd(), "../../packages/db/prisma/migrations"),
    ]) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        onDisk = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        break;
      } catch {
        /* пробуем следующий путь */
      }
    }

    return {
      applied: applied.size,
      onDisk: onDisk.length,
      pending: onDisk.filter((m) => !applied.has(m)).sort(),
    };
  } catch (e) {
    return { applied: 0, onDisk: 0, pending: [], error: (e as Error).message };
  }
}

/** Какой коммит собран в этот образ. Пишется при сборке, может отсутствовать. */
async function deployedCommit(): Promise<string | null> {
  const fromEnv = (process.env.GIT_COMMIT ?? "").trim();
  if (fromEnv) return fromEnv;
  for (const p of [join(process.cwd(), "COMMIT"), join(process.cwd(), "../../COMMIT")]) {
    try {
      const v = (await readFile(p, "utf8")).trim();
      if (v) return v;
    } catch {
      /* нет файла – не беда */
    }
  }
  return null;
}

export const GET = handler(async () => {
  const startedAt = Date.now();

  let dbOk = true;
  let counts = { products: 0, live: 0, soldOut: 0, brands: 0 };
  try {
    const [products, live, brands, inventory] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isArchived: false } }),
      prisma.brand.count(),
      prisma.inventory.findMany({
        where: { product: { isArchived: false } },
        select: { quantityMl: true },
      }),
    ]);
    counts = {
      products,
      live,
      soldOut: inventory.filter((i) => isSoldOut(i.quantityMl)).length,
      brands,
    };
  } catch {
    dbOk = false;
  }

  const bepaidTest = (process.env.BEPAID_TEST ?? "").trim();

  return ok({
    time: new Date().toISOString(),
    deployedCommit: await deployedCommit(),
    db: { ok: dbOk, ...counts },
    migrations: await migrations(),
    env: {
      // Только «задана или нет». Значения не отдаём никогда.
      bepaid: has("BEPAID_SHOP_ID") && has("BEPAID_SECRET_KEY"),
      // А вот это – значение, и намеренно: боевой магазин с тестовым режимом
      // раздаёт товар даром, и увидеть это надо сразу.
      bepaidTestMode: bepaidTest === "1" || bepaidTest.toLowerCase() === "true",
      metaPixel: has("META_PIXEL_ID"),
      metaCapi: has("META_CAPI_TOKEN"),
      metaTestEventCode: has("META_TEST_EVENT_CODE"),
      sms: has("SMS_LOGIN") && has("SMS_PASSWORD"),
      telegram: has("TELEGRAM_BOT_TOKEN") && has("TELEGRAM_CHAT_ID"),
      cronSecret: has("CRON_SECRET"),
      siteUrl: process.env.SITE_URL ?? null,
    },
    tookMs: Date.now() - startedAt,
  });
});
