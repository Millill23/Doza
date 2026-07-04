import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { getCustomerId } from "../../../lib/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const id = getCustomerId(cookies);
  if (!id) return json({ ok: false, error: "Не авторизован" }, 401);

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  try {
    if (action === "setBirthday") {
      await prisma.customer.update({
        where: { id },
        data: { birthday: body.date ? new Date(body.date) : null },
      });
      return json({ ok: true });
    }

    if (action === "addDate") {
      const date = String(body.date ?? "");
      const description = String(body.description ?? "").trim();
      if (!date || !description)
        return json({ ok: false, error: "Укажите дату и описание" }, 400);
      const count = await prisma.customerDate.count({ where: { customerId: id } });
      if (count >= 3)
        return json({ ok: false, error: "Не более 3 памятных дат" }, 400);
      const created = await prisma.customerDate.create({
        data: { customerId: id, date: new Date(date), description },
      });
      return json({ ok: true, id: created.id });
    }

    if (action === "removeDate") {
      const dateId = Number(body.id);
      // удаляем только свою дату
      await prisma.customerDate.deleteMany({
        where: { id: dateId, customerId: id },
      });
      return json({ ok: true });
    }

    return json({ ok: false, error: "Неизвестное действие" }, 400);
  } catch {
    return json({ ok: false, error: "Ошибка сохранения" }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
