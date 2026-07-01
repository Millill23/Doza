import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { verifySmsCode } from "@doza/db/sms-codes";
import { normalizePhone } from "@doza/shared";
import { hashPassword, setSession } from "../../../../lib/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone ?? "");
  const name = (body.name ?? "").trim();
  const password = String(body.password ?? "");
  const code = String(body.code ?? "");

  if (password.length < 6)
    return json({ ok: false, error: "Пароль минимум 6 символов" }, 400);

  const res = await verifySmsCode(phone, "register", code);
  if (!res.ok) return json({ ok: false, error: res.error }, 400);

  const passwordHash = await hashPassword(password);
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: { name, passwordHash, phoneVerified: true },
    create: { phone, name, passwordHash, phoneVerified: true },
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
