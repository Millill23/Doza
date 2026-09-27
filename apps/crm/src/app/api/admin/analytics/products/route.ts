import { topByMl, topByRevenue, bottomByMl } from "@/lib/analytics-data";
import { startOfDay, endOfDay, isDayString } from "@doza/shared/day-range";
import { handler, ok } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Что продаётся, а что стоит.
 *
 * Только агрегаты по товарам: ни имён, ни телефонов, ни заказов. Этого хватает,
 * чтобы предложить, кому поднять цену, кого поставить в акцию и кого убрать из
 * каталога, – а персональных данных в апишке нет по определению.
 */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));

  const period = {
    ...(isDayString(from) ? { from: startOfDay(from) } : {}),
    ...(isDayString(to) ? { to: endOfDay(to) } : {}),
  };

  const [byMl, byRevenue, laggards] = await Promise.all([
    topByMl(limit, period),
    topByRevenue(limit, period),
    bottomByMl(limit, period),
  ]);

  return ok({
    period: { from: from ?? null, to: to ?? null },
    topByMl: byMl,
    topByRevenue: byRevenue,
    // Аутсайдеры считаются от всего каталога: товар, который не продавался ни
    // разу, в журнале продаж отсутствует, а именно он и интересен.
    laggards,
  });
});
