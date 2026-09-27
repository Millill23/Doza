import { prisma } from "@doza/db";
import { submitIndexNow, SITE_HOST } from "@doza/shared/indexnow";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, intParam, type HandlerCtx } from "@/lib/api-auth";
import { writeProduct, setArchived, type ProductPayload } from "@/lib/catalog";
import { productShape, productInclude } from "@/lib/api-shapes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (_request: Request, ctx: HandlerCtx) => {
  const id = intParam(ctx, "id");
  const p = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!p) return fail("Товар не найден", 404);
  return ok({ product: productShape(p) });
});

/**
 * Правка товара.
 *
 * Частичная: присылаешь только то, что меняешь. Исключение – объёмы, фото и
 * похожие: они синхронизируются целиком, и прислать половину списка значит
 * удалить вторую. Поэтому если их нет в запросе, оставляем как было.
 */
export const PATCH = handler(async (request: Request, ctx: HandlerCtx) => {
  const id = intParam(ctx, "id");
  const patch = await body<Partial<ProductPayload> & { dry_run?: boolean }>(request);

  const current = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!current) return fail("Товар не найден", 404);

  const merged: ProductPayload = {
    id,
    brandId: patch.brandId ?? current.brandId,
    name: patch.name ?? current.name,
    // slug не трогаем без явной просьбы: он в адресе страницы, и менять его
    // молча значит ломать ссылки и позиции в поиске.
    slug: patch.slug ?? current.slug,
    gender: (patch.gender ?? current.gender) as ProductPayload["gender"],
    description: patch.description ?? current.description ?? undefined,
    notesTop: patch.notesTop ?? current.notesTop ?? undefined,
    notesMid: patch.notesMid ?? current.notesMid ?? undefined,
    notesBase: patch.notesBase ?? current.notesBase ?? undefined,
    lowStockThreshold:
      patch.lowStockThreshold !== undefined ? patch.lowStockThreshold : current.lowStockThreshold,
    loyaltyPercentOverride:
      patch.loyaltyPercentOverride !== undefined
        ? patch.loyaltyPercentOverride
        : current.loyaltyPercentOverride == null
          ? null
          : Number(current.loyaltyPercentOverride),
    isArchived: patch.isArchived ?? current.isArchived,
    volumes:
      patch.volumes ??
      current.volumes.map((v) => ({
        id: v.id,
        volumeMl: v.volumeMl,
        priceByn: Number(v.priceByn),
        isActive: v.isActive,
      })),
    photos:
      patch.photos ??
      current.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
    similarIds: patch.similarIds ?? current.similarTo.map((s) => s.similarId),
  };

  if (patch.dry_run) {
    const changed = Object.keys(patch).filter((k) => k !== "dry_run");
    ctx.audit(`dry_run: товар #${id} не изменён (${changed.join(", ") || "нет полей"})`);
    return ok({ dryRun: true, wouldChange: changed, result: merged });
  }

  const res = await writeProduct(merged);
  ctx.audit(
    `правка товара #${id} «${merged.name}»: ` +
      Object.keys(patch).filter((k) => k !== "dry_run").join(", "),
  );
  revalidatePath("/products");
  revalidatePath(`/products/${id}/edit`);
  if (!merged.isArchived) {
    void submitIndexNow([`https://${SITE_HOST}/product/${res.slug}`]);
  }

  const after = await prisma.product.findUnique({ where: { id }, include: productInclude });
  return ok({ product: after ? productShape(after) : null });
});

/**
 * Снять с витрины.
 *
 * Именно снять, а не удалить: на товар ссылаются позиции заказов и журнал
 * остатков, и удаление либо оборвёт историю продаж, либо не пройдёт вовсе.
 */
export const DELETE = handler(async (_request: Request, ctx: HandlerCtx) => {
  const id = intParam(ctx, "id");
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return fail("Товар не найден", 404);

  await setArchived(id, true);
  ctx.audit(`товар #${id} «${p.name}» снят с витрины`);
  revalidatePath("/products");
  return ok({ archived: true, id, name: p.name });
});
