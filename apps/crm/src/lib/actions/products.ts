"use server";

import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/** Установить остаток (мл) с записью в журнал. */
export async function setStock(productId: number, quantityMl: number) {
  const session = await requireRole(["admin"]);
  const userId = Number(session.user.id);

  const current = await prisma.inventory.findUnique({ where: { productId } });
  const prev = current?.quantityMl ?? 0;
  const delta = quantityMl - prev;

  await prisma.inventory.upsert({
    where: { productId },
    update: { quantityMl },
    create: { productId, quantityMl },
  });

  if (delta !== 0) {
    await prisma.inventoryLog.create({
      data: {
        productId,
        deltaMl: delta,
        reason: "manual_adjust",
        userId,
      },
    });
  }

  revalidatePath("/products");
}

export async function toggleArchive(productId: number) {
  await requireRole(["admin"]);
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p) return;
  await prisma.product.update({
    where: { id: productId },
    data: { isArchived: !p.isArchived },
  });
  revalidatePath("/products");
}
