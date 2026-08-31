import { prisma } from "@doza/db";
import { settlePaidOrder } from "@doza/db/payments";
import { paidSmsText } from "@doza/db/order-rules";
import { notifyOrder } from "./order-notify";
import { notifyTelegram } from "./telegram";
import { sendSmsFromSite } from "./sms";

/**
 * Что происходит, когда заказ становится оплаченным.
 *
 * Одно место на оба пути — карта и полная оплата баллами. Раньше половина
 * этого висела на подтверждении заказа продавцом, но магазин работает по
 * предоплате и никому не перезванивает: пришли деньги — заказ принят.
 *
 * Порядок важен. Сначала склад и баллы: если списать остатки не удалось,
 * покупателю нельзя обещать, что заказ собран. Потом продавцы, потом
 * покупатель — ему в SMS уходит уже посчитанная сумма баллов.
 */
export async function onOrderPaid(
  orderId: number,
  note: string,
): Promise<{ earned: number }> {
  let earned = 0;

  try {
    const settled = await settlePaidOrder(orderId, await loyaltyDays(), notifyTelegram);
    earned = settled.earned;
  } catch (e) {
    // Деньги уже у нас — откатывать оплату из-за сбоя склада нельзя. Кричим,
    // разбирается человек.
    console.error("[order] не удалось провести оплаченный заказ:", e);
    await notifyTelegram(
      `⚠️ Заказ #${orderId} оплачен, но остатки и баллы не проведены. Проверьте вручную.`,
    ).catch(() => {});
  }

  try {
    await notifyOrder(orderId, note);
  } catch (e) {
    console.error("[order] TG об оплате не отправлен:", e);
  }

  try {
    await sendPaidSms(orderId, earned);
  } catch (e) {
    console.error("[order] SMS покупателю не отправлена:", e);
  }

  return { earned };
}

/** Срок жизни баллов из настроек. */
async function loyaltyDays(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "loyalty_days" } });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) ? n : 180;
}

/**
 * Сказать покупателю, что заказ принят.
 *
 * Отправляется сразу после оплаты, а не при отправке посылки: человек только
 * что отдал деньги и ждёт подтверждения, что его услышали.
 *
 * Про баллы пишем, только если они действительно начислены. Без согласия на
 * обработку данных начисления не будет, и называть сумму в SMS значило бы
 * соврать — тем более что человек по этой SMS пойдёт её искать.
 *
 * Текст зависит от способа получения: самовывозу не обещаем отправку. Сам
 * текст лежит в `order-rules` под тестами — развилку легко потерять.
 */
async function sendPaidSms(orderId: number, earned: number): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerPhone: true, customerId: true, deliveryType: true },
  });
  if (!order) return;

  await sendSmsFromSite({
    kind: "order_paid",
    phone: order.customerPhone,
    text: paidSmsText(order.deliveryType, earned),
    customerId: order.customerId,
  });
}
