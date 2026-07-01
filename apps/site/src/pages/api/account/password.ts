import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import {
  getCustomerId,
  checkPassword,
  hashPassword,
} from "../../../lib/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const id = getCustomerId(cookies);
  if (!id) return json({ ok: false, error: "Не авторизован" }, 401);

  const body = await request.json().catch(() => ({}));
  const oldPassword = String(body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (newPassword.length < 6)
    return json({ ok: false, error: "Новый пароль минимум 6 символов" }, 400);

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer?.passwordHash)
    return json({ ok: false, error: "Аккаунт не найден" }, 404);

  const ok = await checkPassword(oldPassword, customer.passwordHash);
  if (!ok) return json({ ok: false, error: "Текущий пароль неверен" }, 400);

  await prisma.customer.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
