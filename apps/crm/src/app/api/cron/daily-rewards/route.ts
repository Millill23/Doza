import { NextResponse } from "next/server";
import {
  issueTodayRewards,
  isRewardNotifyHour,
  minskHour,
  REWARD_NOTIFY_HOUR,
} from "@doza/db/rewards";
import { sendSmsFromCrm } from "@/lib/sms";
import { notifyTelegram, tgEscape } from "@/lib/telegram";
import { checkCronKey } from "@/lib/cron-auth";

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
  const denied = checkCronKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
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

  let delivered = 0;
  const failures: string[] = [];

  for (const r of issued) {
    const until = r.validUntil?.toLocaleDateString("ru-RU");
    const text =
      r.kind === "birthday"
        ? `${r.customerName}, с днём рождения! Дарим ${r.points} баллов — потратьте их на любимый аромат. DOZA`
        : r.passed
          // Выдали вдогонку: «скоро ваша дата» было бы неправдой.
          ? `${r.customerName}, поздравляем с датой «${r.description}»! Дарим скидку ${r.percent}% до ${until}. DOZA`
          : `${r.customerName}, скоро ваша дата «${r.description}». Дарим скидку ${r.percent}% до ${until}. DOZA`;

    try {
      const res = await sendSmsFromCrm({
        kind: r.kind === "birthday" ? "birthday_gift" : "date_discount",
        phone: r.phone,
        text,
        customerId: r.customerId,
      });
      if (res.ok) delivered++;
      else failures.push(`${r.customerName} (+${r.phone}): ${res.error ?? "не доставлено"}`);
    } catch (e) {
      failures.push(`${r.customerName} (+${r.phone}): ${(e as Error).message}`);
    }
  }

  // Продавцам полезно знать заранее, кто придёт со скидкой.
  if (issued.length > 0) {
    const lines = issued.map((r) =>
      r.kind === "birthday"
        ? `🎂 ${tgEscape(r.customerName)} — день рождения, начислено ${r.points} баллов`
        : `🎁 ${tgEscape(r.customerName)} — «${tgEscape(r.description ?? "")}», скидка ${r.percent}% до ${r.validUntil?.toLocaleDateString("ru-RU")}`,
    );
    // Недоставленные SMS показываем здесь же: подарок начислен, а человек
    // о нём не знает — это надо чинить руками, и узнать об этом надо сразу.
    if (failures.length > 0) {
      lines.push("", "⚠️ <b>SMS не ушли:</b>", ...failures.map(tgEscape));
    }
    try {
      await notifyTelegram(`<b>Подарки по датам</b>\n${lines.join("\n")}`);
    } catch (e) {
      console.error("[rewards] TG не отправлен:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    issued: issued.length,
    delivered,
    failed: failures.length,
  });
}
