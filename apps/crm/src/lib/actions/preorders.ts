"use server";

import { prisma } from "@doza/db";
import { normalizePhone } from "@doza/shared";
import { requireRole } from "@/lib/session";
import { notifyTelegram } from "@/lib/telegram";
import { revalidatePath } from "next/cache";

interface CreatePreorderInput {
  customerName: string;
  phone: string;
  wish: string;
  note?: string;
}

/** Создать заявку на предзаказ целого флакона. Продавец/админ. */
export async function createPreorder(input: CreatePreorderInput) {
  const session = await requireRole(["admin", "seller"]);
  const sellerId = Number(session.user.id);

  const customerName = input.customerName?.trim();
  const phone = normalizePhone(input.phone ?? "");
  const wish = input.wish?.trim();
  const note = input.note?.trim() || null;

  if (!customerName) throw new Error("Укажите имя клиента");
  if (phone.length < 9) throw new Error("Укажите корректный телефон");
  if (!wish) throw new Error("Опишите, что хочет клиент");

  const preorder = await prisma.preorder.create({
    data: { customerName, phone, wish, note, sellerId },
  });

  // TG-оповещение менеджеру (не блокирует ответ при сбое)
  try {
    const seller = await prisma.crmUser.findUnique({
      where: { id: sellerId },
      select: { name: true },
    });
    await notifyTelegram(
      `📦 <b>Новый предзаказ #${preorder.id}</b>\n` +
        `Клиент: ${customerName} (${phone})\n` +
        `Хочет: ${wish}` +
        (note ? `\nКомментарий: ${note}` : "") +
        `\nПродавец: ${seller?.name ?? sellerId}`,
    );
  } catch (e) {
    console.error("[preorder] telegram notify failed:", e);
  }

  revalidatePath("/preorders");
}

/** Сменить статус заявки: new | done | cancelled. Продавец/админ. */
export async function setPreorderStatus(
  id: number,
  status: "new" | "done" | "cancelled",
) {
  await requireRole(["admin", "seller"]);
  if (!["new", "done", "cancelled"].includes(status))
    throw new Error("Неизвестный статус");
  await prisma.preorder.update({
    where: { id: Number(id) },
    data: { status, closedAt: status === "new" ? null : new Date() },
  });
  revalidatePath("/preorders");
}
