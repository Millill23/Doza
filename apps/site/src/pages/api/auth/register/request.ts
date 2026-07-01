import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { createSmsCode } from "@doza/db/sms-codes";
import { normalizePhone } from "@doza/shared";
import { sendSms } from "@doza/shared/sms";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone ?? "");
  const name = (body.name ?? "").trim();

  if (phone.length < 11)
    return json({ ok: false, error: "Укажите корректный номер телефона" }, 400);
  if (name.length < 2)
    return json({ ok: false, error: "Укажите имя" }, 400);

  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (existing?.passwordHash) {
    return json(
      { ok: false, error: "Этот номер уже зарегистрирован. Войдите в кабинет." },
      409,
    );
  }

  const code = await createSmsCode(phone, "register", { name });
  const sms = await sendSms(phone, `${code} — код подтверждения регистрации DOZA`);

  return json({ ok: true, smsSent: sms.ok });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
