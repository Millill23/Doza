import { prisma } from "@doza/db";
import { submitIndexNow, SITE_HOST } from "@doza/shared/indexnow";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, type HandlerCtx } from "@/lib/api-auth";
import { writeProduct, type ProductPayload } from "@/lib/catalog";
import { productShape, productInclude } from "@/lib/api-shapes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Список товаров. По умолчанию – только живые, архивные по запросу. */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const archived = url.searchParams.get("archived");
  const brandId = Number(url.searchParams.get("brandId"));
  const soldOutOnly = url.searchParams.get("soldOut") === "1";
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));

  const where: Record<string, unknown> = {};
  // archived=all – оба вида, archived=1 – только архивные, иначе только живые.
  if (archived !== "all") where.isArchived = archived === "1";
  if (Number.isFinite(brandId) && brandId > 0) where.brandId = brandId;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { brand: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await prisma.product.findMany({
    where,
    include: productInclude,
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    take: limit,
  });

  const items = rows.map(productShape).filter((p) => !soldOutOnly || p.stock.soldOut);
  return ok({ count: items.length, products: items });
});

/**
 * Создать товар.
 *
 * `dry_run: true` – посчитать и ничего не записать. Для наполнения каталога
 * пачкой это единственный способ убедиться, что данные разобраны правильно,
 * не насыпав сотню товаров, которые потом выгребать руками.
 */
export const POST = handler(async (request: Request, ctx: HandlerCtx) => {
  const payload = await body<ProductPayload & { dry_run?: boolean }>(request);

  const brand = await prisma.brand.findUnique({ where: { id: payload.brandId } });
  if (!brand) return fail(`Бренда #${payload.brandId} нет – заведите его через /api/admin/brands`);

  if (payload.dry_run) {
    // Помечаем и холостые прогоны: иначе в журнале остаётся загадочный POST
    // без следа изменений, и непонятно, сорвалось что-то или так и задумано.
    ctx.audit(`dry_run: товар «${payload.name}» не записан`);
    return ok({
      dryRun: true,
      wouldCreate: {
        name: payload.name,
        brand: brand.name,
        volumes: payload.volumes?.length ?? 0,
        photos: payload.photos?.length ?? 0,
      },
    });
  }

  const res = await writeProduct({
    ...payload,
    volumes: payload.volumes ?? [],
    photos: payload.photos ?? [],
    similarIds: payload.similarIds ?? [],
  });

  ctx.audit(`создан товар #${res.id} «${payload.name}»`);
  revalidatePath("/products");
  if (!payload.isArchived) {
    void submitIndexNow([
      `https://${SITE_HOST}/product/${res.slug}`,
      `https://${SITE_HOST}/catalog`,
    ]);
  }

  const created = await prisma.product.findUnique({
    where: { id: res.id },
    include: productInclude,
  });
  return ok({ product: created ? productShape(created) : null }, 201);
});
