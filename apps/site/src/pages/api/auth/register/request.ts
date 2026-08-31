import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { createSmsCode } from "@doza/db/sms-codes";
import { assertBelarusPhone } from "@doza/shared/phone";
import { sendSmsFromSite } from "../../../../lib/sms";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  if (name.length < 2) return json({ ok: false, error: "Укажите имя" }, 400);

  let phone: string;
  try {
    phone = assertBelarusPhone(body.phone ?? "");
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }

  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (existing?.passwordHash) {
    return json(
      { ok: false, error: "Этот номер уже зарегистрирован. Войдите в кабинет." },
      409,
    );
  }

  const code = await createSmsCode(phone, "register", { name });
  const sms = await sendSmsFromSite({
    kind: "otp_register",
    phone,
    text: `${code} — код подтверждения регистрации DOZA`,
  });

  // Отбито ограничением частоты — говорим об этом прямо. Молчаливое «ок» здесь
  // хуже отказа: человек ждёт SMS, которой не будет, и жмёт кнопку снова.
  if (sms.skipped) return json({ ok: false, error: sms.error }, 429);

  return json({ ok: true, smsSent: sms.ok });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
