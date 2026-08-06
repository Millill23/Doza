import { NextResponse } from "next/server";
import { prisma } from "@doza/db";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Напоминание продавцам за день до окончания акции.
 * Вызывается по расписанию (cron) с ключом ?key=CRON_SECRET.
 * Идемпотентно: каждая акция напоминается один раз (флаг reminderSent).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const ending = await prisma.promo.findMany({
    where: {
      reminderSent: false,
      endsAt: { not: null, gt: now, lte: in24h },
    },
    include: { product: { include: { brand: { select: { name: true } } } } },
  });

  for (const p of ending) {
    const parts: string[] = [];
    if (p.discountPercent) parts.push(`скидка −${Number(p.discountPercent)}%`);
    if (p.cashbackPercent) parts.push(`кешбек ${Number(p.cashbackPercent)}%`);
    await notifyTelegram(
      `⏰ <b>Акция заканчивается завтра</b>\n` +
        `${p.product ? `${p.product.brand.name} ${p.product.name}` : "Все товары"}\n` +
        `${parts.join(" · ")}\n` +
        `Окончание: ${p.endsAt?.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
    );
    await prisma.promo.update({
      where: { id: p.id },
      data: { reminderSent: true },
    });
  }

  return NextResponse.json({ ok: true, reminded: ending.length });
}
