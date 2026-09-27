"use server";

import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { setStockMl, setArchived } from "@/lib/catalog";

/**
 * Установить остаток (мл) с записью в журнал.
 *
 * Сама запись – в `@/lib/catalog`, тем же кодом пользуется апишка. Здесь
 * только права, автор правки и сброс кеша.
 */
export async function setStock(productId: number, quantityMl: number) {
  const session = await requireRole(["admin"]);
  await setStockMl(productId, quantityMl, Number(session.user.id));
  revalidatePath("/products");
}

export async function toggleArchive(productId: number) {
  await requireRole(["admin"]);
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p) return;
  await setArchived(productId, !p.isArchived);
  revalidatePath("/products");
}
