import { prisma } from "@doza/db";
import {
  buildPurchaseEvent,
  capiUrl,
  type PurchaseLine,
} from "@doza/shared/meta-events";

/**
 * Отправка покупок в Meta через Conversions API.
 *
 * Браузерного пикселя для покупки мало: оплата подтверждается ответом шлюза, а
 * покупатель на сайт может и не вернуться – закрыл вкладку, пропала сеть,
 * сработал блокировщик. Тогда покупки для Meta не существует, алгоритм учится
 * на неполных данных и откручивает бюджет мимо тех, кто покупает.
 *
 * Событие несёт тот же `event_id`, что и браузерное, поэтому Meta склеивает их
 * в одно и не считает покупку дважды.
 *
 * Ничего из этого не должно ронять оплату: заказ уже оплачен, и сбой рекламной
 * статистики – не повод показывать покупателю ошибку.
 */

const PIXEL_ID = process.env.META_PIXEL_ID ?? "";
const TOKEN = process.env.META_CAPI_TOKEN ?? "";
/** Код тестового события: события видно в Events Manager, но в статистику они не идут. */
const TEST_CODE = process.env.META_TEST_EVENT_CODE ?? "";
const SITE_URL = process.env.SITE_URL ?? "https://doza-parfum.by";

/** Настроена ли отправка. Без ключей просто молчим – это не ошибка. */
export function metaCapiConfigured(): boolean {
  return Boolean(PIXEL_ID && TOKEN);
}

/**
 * Сообщить Meta об оплаченном заказе.
 *
 * Сумму берём ту, что реально ушла с карты: товары плюс доставка, минус
 * списанные баллы. Иначе Meta считала бы выручку по ценнику, а не по кассе, и
 * ставка на рекламу строилась бы на завышенных числах.
 */
export async function reportPurchase(orderId: number): Promise<void> {
  if (!metaCapiConfigured()) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerPhone: true,
      recipientFirstName: true,
      recipientLastName: true,
      city: true,
      postalCode: true,
      totalByn: true,
      deliveryFeeByn: true,
      loyaltySpentByn: true,
      paidAt: true,
      items: { select: { productId: true, qty: true, priceByn: true } },
    },
  });
  if (!order) return;

  const lines: PurchaseLine[] = order.items.map((i) => ({
    id: String(i.productId),
    quantity: i.qty,
    itemPrice: Number(i.priceByn),
  }));

  const value =
    Number(order.totalByn) +
    Number(order.deliveryFeeByn) -
    Number(order.loyaltySpentByn);

  const event = buildPurchaseEvent({
    orderId: order.id,
    value,
    lines,
    user: {
      phone: order.customerPhone,
      // ФИО получателя – единственные имя и фамилия, которые покупатель ввёл
      // сам. Имя из карточки клиента для сопоставления не годится: там часто
      // одно слово вроде «Аня».
      firstName: order.recipientFirstName,
      lastName: order.recipientLastName,
      city: order.city,
      postalCode: order.postalCode,
    },
    sourceUrl: `${SITE_URL}/cart`,
    at: order.paidAt ?? new Date(),
  });

  const body: Record<string, unknown> = { data: [event] };
  if (TEST_CODE) body.test_event_code = TEST_CODE;

  try {
    const res = await fetch(`${capiUrl(PIXEL_ID)}?access_token=${encodeURIComponent(TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Ответ Meta пишем в лог целиком: причина отказа там названа словами, и
      // без неё остаётся гадать, что не так с токеном или пикселем.
      console.error(
        `[meta] покупка #${orderId} не принята (${res.status}):`,
        await res.text().catch(() => ""),
      );
    }
  } catch (e) {
    console.error(`[meta] покупка #${orderId} не отправлена:`, e);
  }
}
