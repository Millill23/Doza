import { prisma } from "@doza/db";
import { activeWeeklyPromo, WEEKLY_PROMO_DAYS } from "@doza/db/weekly-promo";
import { requireRole } from "@/lib/session";
import WeeklyPromoApp from "@/components/WeeklyPromoApp";

export const dynamic = "force-dynamic";

/**
 * «Парфюм недели» — подборка, которую покупатель видит кнопкой в каталоге.
 *
 * Раньше её собирали руками, заводя акцию на каждый аромат по отдельности.
 */
export default async function WeeklyPromoPage() {
  await requireRole(["admin"]);

  const [active, products, history] = await Promise.all([
    activeWeeklyPromo(),
    prisma.product.findMany({
      where: { isArchived: false },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
    prisma.weeklyPromo.findMany({
      orderBy: { startsAt: "desc" },
      take: 10,
      include: { _count: { select: { promos: true } } },
    }),
  ]);

  return (
    <WeeklyPromoApp
      defaultDays={WEEKLY_PROMO_DAYS}
      active={
        active
          ? {
              id: active.id,
              name: active.name,
              discountPercent: active.discountPercent,
              endsAt: active.endsAt.toISOString(),
              productIds: active.productIds,
            }
          : null
      }
      products={products.map((p) => ({
        id: p.id,
        label: p.brand.name + " — " + p.name,
      }))}
      history={history.map((h) => ({
        id: h.id,
        name: h.name,
        discountPercent: Number(h.discountPercent),
        startsAt: h.startsAt.toISOString(),
        endsAt: h.endsAt.toISOString(),
        isActive: h.isActive,
        count: h._count.promos,
      }))}
    />
  );
}
