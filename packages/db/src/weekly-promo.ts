import { prisma } from "./index";

/**
 * «Парфюм недели» — подборка ароматов с одинаковой скидкой на неделю.
 *
 * Сама скидка живёт в обычных `Promo`: подборка их создаёт и удаляет вместе с
 * собой. Поэтому движку цен о ней знать не нужно — он и так умеет считать
 * акцию на товар, и вторая механика скидок рядом с первой не заводится.
 */

/** Сколько длится подборка по умолчанию. */
export const WEEKLY_PROMO_DAYS = 7;

export function weeklyPromoEnd(from: Date, days = WEEKLY_PROMO_DAYS): Date {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return end;
}

/** Действующая подборка вместе с товарами. */
export async function activeWeeklyPromo(now = new Date()) {
  const promo = await prisma.weeklyPromo.findFirst({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { startsAt: "desc" },
    include: {
      promos: {
        select: {
          productId: true,
          product: { select: { id: true, slug: true, isArchived: true } },
        },
      },
    },
  });
  if (!promo) return null;

  return {
    id: promo.id,
    name: promo.name,
    discountPercent: Number(promo.discountPercent),
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    productIds: promo.promos
      .filter((p) => p.product && !p.product.isArchived)
      .map((p) => p.productId!),
  };
}

/**
 * Завести подборку: одна запись кампании плюс по обычной акции на каждый товар.
 *
 * Прежняя действующая подборка выключается: двух «Парфюмов недели» сразу быть
 * не должно — покупатель увидел бы в каталоге одну кнопку и два разных набора.
 */
export async function createWeeklyPromo(input: {
  name: string;
  discountPercent: number;
  productIds: number[];
  startsAt: Date;
  endsAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.weeklyPromo.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const promo = await tx.weeklyPromo.create({
      data: {
        name: input.name,
        discountPercent: input.discountPercent,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });

    await tx.promo.createMany({
      data: input.productIds.map((productId) => ({
        productId,
        discountPercent: input.discountPercent,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        weeklyPromoId: promo.id,
      })),
    });

    return promo;
  });
}

/**
 * Убрать подборку вместе со скидками.
 *
 * Скидки уходят каскадом по связи: оставить их — значит оставить цену, у
 * которой больше нет причины.
 */
export async function deleteWeeklyPromo(id: number) {
  await prisma.weeklyPromo.delete({ where: { id } });
}
