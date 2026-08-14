import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { getCustomerId } from "../../../lib/customer-auth";

export const prerender = false;

/**
 * Даты клиента: добавить можно, изменить и удалить — нет.
 *
 * За день рождения и памятные даты дарятся баллы и скидка, поэтому
 * редактирование пришлось закрыть: иначе достаточно поставить сегодняшнее
 * число, забрать подарок и вернуть дату обратно — и так сколько угодно раз.
 * Добавление безопасно: каждая дата даёт награду не чаще раза в год, а
 * количество ограничено. Исправить ошибку может продавец в CRM.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const id = getCustomerId(cookies);
  if (!id) return json({ ok: false, error: "Не авторизован" }, 401);

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  try {
    if (action === "setBirthday") {
      const current = await prisma.customer.findUnique({
        where: { id },
        select: { birthday: true },
      });
      if (current?.birthday)
        return json(
          {
            ok: false,
            error:
              "День рождения уже указан. Изменить его может только продавец — обратитесь к нам.",
          },
          403,
        );

      const date = String(body.date ?? "");
      if (!date) return json({ ok: false, error: "Укажите дату" }, 400);
      await prisma.customer.update({
        where: { id },
        data: { birthday: new Date(date) },
      });
      return json({ ok: true });
    }

    if (action === "addDate") {
      const date = String(body.date ?? "");
      const description = String(body.description ?? "").trim();
      if (!date || !description)
        return json({ ok: false, error: "Укажите дату и описание" }, 400);
      if (description.length > 60)
        return json({ ok: false, error: "Описание слишком длинное" }, 400);

      const count = await prisma.customerDate.count({ where: { customerId: id } });
      if (count >= 3)
        return json({ ok: false, error: "Не более 3 памятных дат" }, 400);

      const created = await prisma.customerDate.create({
        data: { customerId: id, date: new Date(date), description },
      });
      return json({ ok: true, id: created.id });
    }

    // Удаление и изменение намеренно недоступны клиенту — см. комментарий выше.
    return json(
      {
        ok: false,
        error: "Изменить или удалить дату может только продавец — обратитесь к нам.",
      },
      403,
    );
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
