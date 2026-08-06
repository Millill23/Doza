"use server";

import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import { revalidatePath } from "next/cache";

interface CreateSuperPromoInput {
  name: string;
  /** Размер группы: каждый N-й товар бесплатно. 3 → «1+1=3». */
  groupSize: number;
  /** true → участвуют все товары каталога. */
  allProducts: boolean;
  /** Список товаров-участников (игнорируется при allProducts). */
  productIds: number[];
  startsAt?: string | null;
  endsAt?: string | null;
}

/** Создать супер-акцию. Только админ. */
export async function createSuperPromo(input: CreateSuperPromoInput) {
  await requireRole(["admin"]);

  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new Error("Укажите название акции");

  const groupSize = Math.floor(Number(input.groupSize) || 3);
  if (groupSize < 2 || groupSize > 20)
    throw new Error("Размер группы должен быть от 2 до 20");

  const allProducts = input.allProducts === true;
  const productIds = allProducts
    ? []
    : [...new Set((input.productIds ?? []).map(Number).filter(Boolean))];
  if (!allProducts && productIds.length === 0)
    throw new Error("Выберите товары или отметьте «все товары»");

  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt < startsAt)
    throw new Error("Дата окончания раньше начала");

  await prisma.superPromo.create({
    data: {
      name,
      kind: "n_plus_one",
      groupSize,
      allProducts,
      startsAt,
      endsAt,
      products: productIds.length
        ? { create: productIds.map((productId) => ({ productId })) }
        : undefined,
    },
  });

  revalidatePath("/super-promos");
  revalidatePath("/cash");
}

/** Включить/выключить супер-акцию без удаления. Только админ. */
export async function toggleSuperPromo(id: number, isActive: boolean) {
  await requireRole(["admin"]);
  await prisma.superPromo.update({
    where: { id: Number(id) },
    data: { isActive: Boolean(isActive) },
  });
  revalidatePath("/super-promos");
  revalidatePath("/cash");
}

/** Удалить супер-акцию. Только админ. */
export async function deleteSuperPromo(id: number) {
  await requireRole(["admin"]);
  await prisma.superPromo.delete({ where: { id: Number(id) } });
  revalidatePath("/super-promos");
  revalidatePath("/cash");
}
