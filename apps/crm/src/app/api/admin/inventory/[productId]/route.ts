import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, intParam, type HandlerCtx } from "@/lib/api-auth";
import { setStockMl } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Выставить остаток.
 *
 * Абсолютное значение, а не прибавка: «сколько в бутылке» – то, что продавец
 * видит глазами, и повторный вызов с тем же числом ничего не испортит.
 * Изменение пишется в журнал остатков без автора: сотрудника за этим
 * действием нет.
 */
export const PUT = handler(async (request: Request, ctx: HandlerCtx) => {
  const productId = intParam(ctx, "productId");
  const { quantityMl } = await body<{ quantityMl?: number }>(request);
  if (typeof quantityMl !== "number" || !Number.isFinite(quantityMl) || quantityMl < 0) {
    return fail("quantityMl – неотрицательное число миллилитров");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, brand: { select: { name: true } } },
  });
  if (!product) return fail("Товар не найден", 404);

  const res = await setStockMl(productId, quantityMl, null);
  ctx.audit(
    `остаток «${product.brand.name} ${product.name}»: ${res.before} -> ${res.after} мл`,
  );
  revalidatePath("/products");
  return ok({ productId, ...res });
});
