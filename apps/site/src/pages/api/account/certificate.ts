import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { activateCertificate, CertificateError } from "@doza/db/certificates";
import { sendSmsFromSite } from "../../../lib/sms";
import { getCustomerId } from "../../../lib/customer-auth";
import { notifyTelegram, tgEscape } from "../../../lib/telegram";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Баллы без лишних нулей. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Самостоятельная активация сертификата клиентом из личного кабинета. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const id = getCustomerId(cookies);
  if (!id) return json({ ok: false, error: "Не авторизован" }, 401);

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "");
  if (!code.trim())
    return json({ ok: false, error: "Введите код сертификата" }, 400);

  const days = await getSetting("loyalty_days", 180);

  let result;
  try {
    result = await activateCertificate({
      code,
      customerId: id,
      activatedById: null, // клиент активировал сам
      loyaltyDays: days,
    });
  } catch (e) {
    if (e instanceof CertificateError)
      return json({ ok: false, error: e.message }, 400);
    console.error("[account] ошибка активации сертификата:", e);
    return json({ ok: false, error: "Не удалось активировать сертификат" }, 500);
  }

  try {
    await sendSmsFromSite({
      kind: "certificate",
      phone: result.customerPhone,
      text: `Сертификат активирован! Вам начислено ${fmt(result.awarded)} бонусов. Всего бонусов: ${fmt(result.balance)}`,
      customerId: result.customerId,
    });
  } catch (e) {
    console.error("[account] SMS об активации не отправлена:", e);
  }

  try {
    await notifyTelegram(
      `✅ <b>Сертификат активирован</b> (личный кабинет)\n` +
        `Код: <code>${result.code}</code> · номинал ${fmt(result.denomination)} BYN\n` +
        `Клиент: ${tgEscape(result.customerName)} (${result.customerPhone})${result.isVip ? " ⭐VIP" : ""}\n` +
        `Начислено: <b>${fmt(result.awarded)}</b> баллов` +
        (result.isVip && result.awarded !== result.denomination
          ? " (по цене покупки — VIP)"
          : ""),
    );
  } catch (e) {
    console.error("[account] TG об активации не отправлено:", e);
  }

  return json({
    ok: true,
    awarded: result.awarded,
    balance: result.balance,
    denomination: result.denomination,
    isVip: result.isVip,
  });
};
