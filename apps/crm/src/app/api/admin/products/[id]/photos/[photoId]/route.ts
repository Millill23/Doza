import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, intParam, type HandlerCtx } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Переставить фото: меньший `sortOrder` – ближе к обложке. */
export const PATCH = handler(async (request: Request, ctx: HandlerCtx) => {
  const productId = intParam(ctx, "id");
  const photoId = intParam(ctx, "photoId");
  const { sortOrder } = await body<{ sortOrder?: number }>(request);
  if (typeof sortOrder !== "number") return fail("Укажите sortOrder");

  const photo = await prisma.productPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.productId !== productId) return fail("Фото не найдено", 404);

  await prisma.productPhoto.update({ where: { id: photoId }, data: { sortOrder } });
  ctx.audit(`фото #${photoId} товара #${productId} -> порядок ${sortOrder}`);
  revalidatePath("/products");
  return ok({ id: photoId, sortOrder });
});

/**
 * Убрать фото из карточки.
 *
 * Файл в `uploads/` остаётся: на него может ссылаться другая карточка или
 * копия товара, и удалять его вслепую значит однажды оставить каталог с
 * битыми картинками.
 */
export const DELETE = handler(async (_request: Request, ctx: HandlerCtx) => {
  const productId = intParam(ctx, "id");
  const photoId = intParam(ctx, "photoId");

  const photo = await prisma.productPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.productId !== productId) return fail("Фото не найдено", 404);

  await prisma.productPhoto.delete({ where: { id: photoId } });
  ctx.audit(`удалено фото #${photoId} товара #${productId}`);
  revalidatePath("/products");
  return ok({ deleted: true, id: photoId });
});
