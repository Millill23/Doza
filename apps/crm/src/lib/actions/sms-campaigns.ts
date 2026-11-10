"use server";

import { prisma, Prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

export async function searchSmsRecipients(query: string) {
  await requireRole(["admin"]);
  const term = query.trim().slice(0, 100);
  const digits = term.replace(/\D/g, "");
  return prisma.customer.findMany({
    where: {
      consentStatus: "confirmed",
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 30,
  });
}

export async function createSmsCampaign(input: {
  id: string;
  audience: "all" | "selected";
  customerIds: number[];
  expectedCount: number;
  text: string;
  points: number;
  reason: string;
}) {
  const session = await requireRole(["admin"]);
  const userId = Number(session.user.id);
  const { id, audience, customerIds, expectedCount, points } = input;
  const text = input.text.trim();
  const reason = input.reason.trim();

  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
      (audience !== "all" && audience !== "selected") ||
      !Number.isSafeInteger(expectedCount) || expectedCount < 1 ||
      customerIds.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    return { error: "Проверьте список получателей" };
  }
  if (!text || text.length > 500) return { error: "Введите текст от 1 до 500 символов" };
  if (!Number.isFinite(points) || points < 0 || points > 99999999.99 ||
      Number(points.toFixed(2)) !== points) {
    return { error: "Укажите корректное число баллов с точностью до сотых" };
  }
  if (points > 0 && (reason.length < 3 || reason.length > 200)) {
    return { error: "Укажите причину начисления от 3 до 200 символов" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.smsCampaign.findUnique({ where: { id } });
      if (existing) return existing.userId === userId ? { id } : { error: "Рассылка уже существует" };

      const recipients = await tx.customer.findMany({
        where: {
          consentStatus: "confirmed",
          ...(audience === "selected" ? { id: { in: customerIds } } : {}),
        },
        select: { id: true },
      });
      if (recipients.length !== expectedCount) {
        return { error: "Список получателей изменился. Обновите страницу и проверьте выбор." };
      }
      const setting = await tx.setting.findUnique({ where: { key: "loyalty_days" } });
      const days = Number(setting?.value ?? 180);
      const loyaltyDays = Number.isSafeInteger(days) && days >= 0 && days <= 36500 ? days : 180;
      await tx.smsCampaign.create({
        data: { id, text, points, reason: points > 0 ? reason : null, loyaltyDays, userId },
      });
      // Ограничиваем размер запроса даже при большой базе.
      for (let offset = 0; offset < recipients.length; offset += 1000) {
        await tx.smsCampaignRecipient.createMany({
          data: recipients.slice(offset, offset + 1000).map(({ id: customerId }) => ({
            campaignId: id,
            customerId,
          })),
        });
      }
      return { id };
    }, { timeout: 30000 });
    revalidatePath("/sms/campaigns");
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.smsCampaign.findUnique({ where: { id } });
      if (existing?.userId === userId) return { id };
    }
    throw error;
  }
}

export async function retrySmsCampaign(campaignId: string) {
  await requireRole(["admin"]);
  await prisma.smsCampaignRecipient.updateMany({
    where: { campaignId, status: "failed" },
    data: { status: "pending", nextAttempt: new Date(), attempts: 0 },
  });
  revalidatePath(`/sms/campaigns/${campaignId}`);
}
