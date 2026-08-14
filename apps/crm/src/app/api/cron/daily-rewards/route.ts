import { NextResponse } from "next/server";
import {
  issueTodayRewards,
  isRewardNotifyHour,
  minskHour,
  REWARD_NOTIFY_HOUR,
} from "@doza/db/rewards";
import { sendSmsFromCrm } from "@/lib/sms";
import { notifyTelegram, tgEscape } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ежедневная выдача подарков по датам: баллы ко дню рождения и скидка к
 * памятной дате. Вызывается по расписанию с ключом ?key=CRON_SECRET.
 *
 * Рассылка идёт строго в {@link REWARD_NOTIFY_HOUR} по Минску: поздравление в
 * семь утра или в полночь раздражает, а не радует. Планировщик дёргает роут
 * чаще раза в час — чтобы короткий перезапуск контейнера не съел нужное окно, —
 * а в остальные часы роут просто ничего не делает.
 *
 * Повторно ничего не выдаст: на каждый повод заводится запись с уникальным
 * ключом, и `issueTodayRewards` возвращает только созданное в этот раз. SMS
 * шлём ровно по этому списку, иначе клиент получал бы поздравление каждый час.
 *
 * `?force=1` — выдать вне расписания. Нужно, чтобы проверить работу задачи
 * после деплоя, не дожидаясь одиннадцати.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const force = url.searchParams.get("force") === "1";
  if (!force && !isRewardNotifyHour()) {
    return NextResponse.json({
      ok: true,
      skipped: "не время рассылки",
      minskHour: minskHour(),
      notifyHour: REWARD_NOTIFY_HOUR,
    });
  }

  const issued = await issueTodayRewards();

  for (const r of issued) {
    const text =
      r.kind === "birthday"
        ? `${r.customerName}, с днём рождения! Дарим ${r.points} баллов — потратьте их на любимый аромат. DOZA`
        : `${r.customerName}, скоро ваша дата «${r.description}». Дарим скидку ${r.percent}% до ${r.validUntil?.toLocaleDateString("ru-RU")}. DOZA`;

    try {
      await sendSmsFromCrm({
        kind: r.kind === "birthday" ? "birthday_gift" : "date_discount",
        phone: r.phone,
        text,
        customerId: r.customerId,
      });
    } catch (e) {
      console.error("[rewards] SMS не отправлена:", e);
    }
  }

  // Продавцам полезно знать заранее, кто придёт со скидкой.
  if (issued.length > 0) {
    const lines = issued.map((r) =>
      r.kind === "birthday"
        ? `🎂 ${tgEscape(r.customerName)} — день рождения, начислено ${r.points} баллов`
        : `🎁 ${tgEscape(r.customerName)} — «${tgEscape(r.description ?? "")}», скидка ${r.percent}% до ${r.validUntil?.toLocaleDateString("ru-RU")}`,
    );
    try {
      await notifyTelegram(`<b>Подарки по датам</b>\n${lines.join("\n")}`);
    } catch (e) {
      console.error("[rewards] TG не отправлен:", e);
    }
  }

  return NextResponse.json({ ok: true, issued: issued.length });
}
