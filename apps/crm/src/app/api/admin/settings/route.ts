import { prisma } from "@doza/db";
import { clampPercent, SPILL_PERCENT_SETTING } from "@doza/db/spill-rules";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, type HandlerCtx } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Белый список настроек. Тот же, что в CRM.
 *
 * Именно список, а не «любой ключ»: в `settings` лежат и переключатели SMS, и
 * прочие вещи, которые не должны меняться запросом из апишки.
 */
const ALLOWED: Record<string, { about: string; fallback: string }> = {
  loyalty_percent: { about: "процент начисления баллов", fallback: "5" },
  loyalty_days: { about: "срок жизни баллов, дней (0 – бессрочно)", fallback: "180" },
  low_stock_threshold: { about: "порог остатка по умолчанию, мл", fallback: "50" },
  [SPILL_PERCENT_SETTING]: { about: "потери при распиве, %", fallback: "0" },
  vip_discount_percent: { about: "скидка по VIP-карте, %", fallback: "20" },
  remnant_percent: { about: "скидка на остаток во флаконе, %", fallback: "20" },
};

export const GET = handler(async () => {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(ALLOWED) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return ok({
    settings: Object.entries(ALLOWED).map(([key, meta]) => ({
      key,
      about: meta.about,
      value: byKey.get(key) ?? meta.fallback,
      isDefault: !byKey.has(key),
    })),
  });
});

export const PUT = handler(async (request: Request, ctx: HandlerCtx) => {
  const patch = await body<Record<string, string | number>>(request);
  const unknown = Object.keys(patch).filter((k) => !(k in ALLOWED));
  if (unknown.length) return fail(`Эти настройки менять нельзя: ${unknown.join(", ")}`);

  const changed: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    // Процент потерь ограничиваем теми же рамками, что и расчёт: сохранённая
    // опечатка вроде «50» съедала бы полфлакона на каждой продаже.
    const value =
      key === SPILL_PERCENT_SETTING ? String(clampPercent(Number(raw))) : String(raw);
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    changed.push(`${key}=${value}`);
  }

  ctx.audit(`настройки: ${changed.join(", ")}`);
  revalidatePath("/settings");
  return ok({ changed });
});
