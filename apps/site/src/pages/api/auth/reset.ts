import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { normalizePhone } from "@doza/shared";
import { sendSms } from "@doza/shared/sms";
import { hashPassword } from "../../../lib/customer-auth";

export const prerender = false;

// Генерация нового пароля (без похожих символов)
function genPassword(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone ?? "");

  const customer = await prisma.customer.findUnique({ where: { phone } });

  // Не раскрываем, зарегистрирован ли номер — всегда ok.
  // Пароль выдаём тем, у кого он уже есть, ЛИБО кого админ подтвердил лично
  // (phoneVerified: VIP/офлайн-регистрация) — так VIP получает первый вход.
  // Случайные покупатели из кассы (phoneVerified=false) сюда не попадают.
  if (customer && (customer.passwordHash || customer.phoneVerified)) {
    const newPass = genPassword();
    await prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(newPass) },
    });
    await sendSms(phone, `Новый пароль для входа в DOZA: ${newPass}`);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Если номер зарегистрирован, новый пароль отправлен по SMS.",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
