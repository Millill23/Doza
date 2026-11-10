import { prisma } from "@doza/db";
import { earnPoints } from "@doza/db/loyalty";
import { isSmsKindEnabled, sendTrackedSms } from "@doza/db/sms-log";
import { sendSms, smsPhone, type SmsResult } from "@doza/shared/sms";

const MINUTE = 60_000;
const RETRY_DELAY = [5 * MINUTE, 30 * MINUTE];

async function processRecipient(id: number) {
  const claimed = await prisma.smsCampaignRecipient.updateMany({
    where: { id, status: "pending", nextAttempt: { lte: new Date() } },
    data: { status: "sending", nextAttempt: new Date(Date.now() + 10 * MINUTE) },
  });
  if (!claimed.count) return;

  const recipient = await prisma.smsCampaignRecipient.findUniqueOrThrow({
    where: { id },
    include: { campaign: true, customer: { select: { id: true, phone: true, consentStatus: true } } },
  });
  const { campaign, customer } = recipient;
  const phone = customer ? smsPhone(customer.phone) : "";
  if (!customer || customer.consentStatus !== "confirmed" || !/^375\d{9}$/.test(phone)) {
    await prisma.smsCampaignRecipient.update({
      where: { id },
      data: { status: "skipped", error: "Нет действующего согласия или корректного телефона" },
    });
    return;
  }

  let gateway: SmsResult | undefined;
  let eligible = true;
  const result = await sendTrackedSms({
    kind: "campaign",
    phone,
    text: campaign.text,
    customerId: customer.id,
    userId: campaign.userId,
    send: async (to, message) => {
      eligible = await prisma.$transaction(async (tx) => {
        const [current] = await tx.$queryRaw<{ phone: string; consent_status: string }[]>`
          SELECT phone, consent_status FROM customers WHERE id = ${customer.id} FOR UPDATE
        `;
        if (current?.consent_status !== "confirmed" || current.phone !== customer.phone) {
          return false;
        }
        if (Number(campaign.points) > 0 && !recipient.pointsGranted) {
          const granted = await earnPoints(
            customer.id,
            Number(campaign.points),
            campaign.loyaltyDays,
            { type: "sms_campaign", id },
            { tx, reason: campaign.reason ?? undefined },
          );
          if (!granted) return false;
          await tx.smsCampaignRecipient.update({ where: { id }, data: { pointsGranted: true } });
        }
        return true;
      });
      if (!eligible) return { ok: false, error: "Согласие или телефон изменились" };
      gateway = await sendSms(to, message, AbortSignal.timeout(8_000));
      return gateway;
    },
  });

  const attempts = recipient.attempts + 1;
  const delay = RETRY_DELAY[attempts - 1];
  await prisma.smsCampaignRecipient.update({
    where: { id },
    data: {
      status: result.skipped ? "pending"
        : !eligible ? "skipped"
        : result.ok ? "accepted"
        : gateway?.uncertain ? "uncertain"
        : delay ? "pending" : "failed",
      attempts: result.skipped || !eligible ? recipient.attempts : attempts,
      nextAttempt: new Date(Date.now() + (result.skipped ? 5 * MINUTE : delay ?? 0)),
      error: result.error ?? null,
    },
  });
}

export async function processSmsCampaigns() {
  // Если процесс остановился после передачи шлюзу, повтор может создать дубль.
  await prisma.smsCampaignRecipient.updateMany({
    where: { status: "sending", nextAttempt: { lte: new Date() } },
    data: { status: "uncertain", error: "Обработка прервалась. Проверьте отправку у провайдера." },
  });
  if (!process.env.SMS_LOGIN || !process.env.SMS_PASSWORD || !(await isSmsKindEnabled("campaign"))) {
    return 0;
  }

  const due = await prisma.smsCampaignRecipient.findMany({
    where: { status: "pending", nextAttempt: { lte: new Date() } },
    orderBy: [{ nextAttempt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 100,
  });
  const deadline = Date.now() + 45_000;
  let processed = 0;
  for (const { id } of due) {
    if (Date.now() >= deadline) break;
    try {
      await processRecipient(id);
      processed++;
    } catch (error) {
      console.error("[sms-campaign] ошибка обработки получателя", id, error);
    }
  }
  return processed;
}
