"use server";

import { prisma } from "@doza/db";
import { validateShares } from "@doza/db/sales-split";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/** Границы календарного дня в местном времени. */
function dayRange(day: string): { from: Date; to: Date } {
  const [y, m, d] = day.split("-").map(Number);
  return {
    from: new Date(y, m - 1, d, 0, 0, 0, 0),
    to: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

/** Выручка за день в разрезе аккаунтов + уже заданное разделение. */
export async function getDaySales(day: string) {
  await requireRole(["admin"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Некорректная дата");

  const { from, to } = dayRange(day);
  const sales = await prisma.offlineSale.findMany({
    where: { status: "closed", createdAt: { gte: from, lte: to } },
    select: { sellerId: true, totalByn: true },
  });

  const bySeller = new Map<number, { sum: number; count: number }>();
  for (const s of sales) {
    const cur = bySeller.get(s.sellerId) ?? { sum: 0, count: 0 };
    cur.sum += Number(s.totalByn);
    cur.count += 1;
    bySeller.set(s.sellerId, cur);
  }

  const [users, existing] = await Promise.all([
    prisma.crmUser.findMany({
      where: { isActive: true, role: { in: ["admin", "seller"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.salesSplit.findMany({
      where: { date: new Date(`${day}T00:00:00.000Z`) },
      include: { shares: { select: { sellerId: true, percent: true } } },
    }),
  ]);
  const umap = new Map(users.map((u) => [u.id, u.name]));

  return {
    day,
    accounts: [...bySeller.entries()]
      .map(([sellerId, v]) => ({
        sellerId,
        name: umap.get(sellerId) ?? `#${sellerId}`,
        sum: Math.round(v.sum * 100) / 100,
        count: v.count,
      }))
      .sort((a, b) => b.sum - a.sum),
    sellers: users,
    splits: existing.map((s) => ({
      sourceSellerId: s.sourceSellerId,
      shares: s.shares.map((x) => ({
        sellerId: x.sellerId,
        percent: Number(x.percent),
      })),
    })),
  };
}

/**
 * Задать разделение выручки за день. Только админ.
 * Перезаписывает предыдущее разделение для этой пары день+аккаунт.
 */
export async function saveSalesSplit(input: {
  day: string;
  sourceSellerId: number;
  shares: { sellerId: number; percent: number }[];
}) {
  const session = await requireRole(["admin"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day))
    throw new Error("Некорректная дата");

  const shares = (input.shares ?? [])
    .map((s) => ({ sellerId: Number(s.sellerId), percent: Number(s.percent) }))
    .filter((s) => s.sellerId && Number.isFinite(s.percent) && s.percent > 0);

  const error = validateShares(shares);
  if (error) throw new Error(error);

  const sourceSellerId = Number(input.sourceSellerId);
  if (!sourceSellerId) throw new Error("Выберите аккаунт, чью выручку делим");

  // DATE-колонка: фиксируем полночь UTC, чтобы день не «поехал» из-за таймзоны
  const date = new Date(`${input.day}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.salesSplit.findUnique({
      where: { date_sourceSellerId: { date, sourceSellerId } },
      select: { id: true },
    });
    if (existing) {
      await tx.salesSplitShare.deleteMany({ where: { splitId: existing.id } });
      await tx.salesSplit.update({
        where: { id: existing.id },
        data: {
          createdById: Number(session.user.id),
          shares: { create: shares },
        },
      });
      return;
    }
    await tx.salesSplit.create({
      data: {
        date,
        sourceSellerId,
        createdById: Number(session.user.id),
        shares: { create: shares },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/sales-splits");
  return { ok: true };
}

/** Убрать разделение — выручка вернётся исходному аккаунту. */
export async function deleteSalesSplit(day: string, sourceSellerId: number) {
  await requireRole(["admin"]);
  const date = new Date(`${day}T00:00:00.000Z`);
  await prisma.salesSplit.deleteMany({
    where: { date, sourceSellerId: Number(sourceSellerId) },
  });
  revalidatePath("/");
  revalidatePath("/sales-splits");
  return { ok: true };
}
