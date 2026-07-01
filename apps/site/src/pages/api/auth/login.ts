import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { normalizePhone } from "@doza/shared";
import { checkPassword, setSession } from "../../../lib/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone ?? "");
  const password = String(body.password ?? "");

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer?.passwordHash) {
    return json({ ok: false, error: "Неверный телефон или пароль" }, 401);
  }
  const ok = await checkPassword(password, customer.passwordHash);
  if (!ok) return json({ ok: false, error: "Неверный телефон или пароль" }, 401);

  setSession(cookies, customer.id);
  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
