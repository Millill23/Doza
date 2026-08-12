import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { verifySmsCode } from "@doza/db/sms-codes";
import { assertBelarusPhone } from "@doza/shared/phone";
import { assertCustomerName } from "@doza/shared/customer-name";
import { hashPassword, setSession } from "../../../../lib/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const code = String(body.code ?? "");

  // Имя уходит в SMS и Telegram, телефон становится идентификатором клиента.
  let name: string;
  let phone: string;
  try {
    name = assertCustomerName(body.name ?? "");
    phone = assertBelarusPhone(body.phone ?? "");
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }

  if (password.length < 6)
    return json({ ok: false, error: "Пароль минимум 6 символов" }, 400);
  // Регистрация в личном кабинете = вступление в программу лояльности, а она
  // по 99-З требует согласия на обработку ПД. Галочка проверяется и на сервере.
  if (body.consent !== true)
    return json(
      { ok: false, error: "Нужно согласие на обработку персональных данных" },
      400,
    );

  const res = await verifySmsCode(phone, "register", code);
  if (!res.ok) return json({ ok: false, error: res.error }, 400);

  const passwordHash = await hashPassword(password);
  const consentFields = {
    consentStatus: "confirmed" as const,
    consentConfirmedAt: new Date(),
  };
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: { name, passwordHash, phoneVerified: true, ...consentFields },
    create: { phone, name, passwordHash, phoneVerified: true, ...consentFields },
  });

  setSession(cookies, customer.id);
  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
