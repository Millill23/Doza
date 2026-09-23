import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import {
  DELIVERY_TYPE_LABEL,
  isPostDelivery,
  needsPostalAddress,
  needsOffice,
} from "@doza/db/delivery-rules";
import { notifyTelegram, tgEscape } from "./telegram";

/**
 * Сообщить продавцам о заказе.
 *
 * Вызывается после подтверждения оплаты, а не при создании заказа: магазин
 * работает по предоплате, и неоплаченный заказ собирать нельзя. Оповещать о
 * каждой попытке было бы шумом – покупатель может открыть страницу банка и
 * закрыть её.
 */
export async function notifyOrder(orderId: number, note: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { include: { brand: true } } } },
    },
  });
  if (!order) return;

  const toPay =
    Math.round((Number(order.totalByn) - Number(order.loyaltySpentByn)) * 100) / 100;

  const lines = [
    `✅ <b>Оплачен заказ #${order.id}</b>`,
    ``,
    // Всё, что ввёл покупатель, экранируем: символ «<» ломает parse_mode=HTML
    // и Telegram отклоняет сообщение целиком.
    `👤 ${tgEscape(order.customerName)}`,
    `📞 +${order.customerPhone}`,
    // Называем службу, а не «доставка почтой»: собирая посылку, продавец
    // должен видеть, куда её нести.
    `🚚 ${DELIVERY_TYPE_LABEL[order.deliveryType]}`,
    // Куда едет посылка. Что именно показывать, решают те же функции, что
    // спрашивают данные при оформлении. Раньше тут стояло `=== "post"` –
    // значение времён, когда почта была одна, – и после появления Белпочты с
    // Европочтой адрес пропал из уведомления совсем.
    needsPostalAddress(order.deliveryType)
      ? // Адрес одной строкой – в таком виде его и переписывают на бланк.
        `📍 ${tgEscape(
          [order.postalCode, order.region, order.city, order.address]
            .filter(Boolean)
            .join(", "),
        )}`
      : "",
    needsOffice(order.deliveryType) && order.europostOfficeCode
      ? `📍 Отделение №${tgEscape(order.europostOfficeCode)}${
          order.europostOfficeText ? `, ${tgEscape(order.europostOfficeText)}` : ""
        }`
      : "",
    isPostDelivery(order.deliveryType)
      ? `📦 Получатель: ${tgEscape(
          [order.recipientLastName, order.recipientFirstName, order.recipientMiddleName]
            .filter(Boolean)
            .join(" "),
        )}${order.recipientPhone ? `, +${order.recipientPhone}` : ""}`
      : "",
    ``,
    `<b>Состав:</b>`,
    ...order.items.map(
      (i) =>
        `• ${tgEscape(`${i.product.brand.name} ${i.product.name}, ${i.volumeMl} мл ×${i.qty}`)} – ${formatByn(Number(i.priceByn) * i.qty)}`,
    ),
    ``,
    `Сумма: <b>${formatByn(Number(order.totalByn))}</b>`,
    Number(order.loyaltySpentByn) > 0
      ? `Списано баллов: ${formatByn(Number(order.loyaltySpentByn))}`
      : "",
    `Оплачено: <b>${formatByn(toPay)}</b> (${note})`,
    order.comment ? `\n💬 ${tgEscape(order.comment)}` : "",
  ].filter(Boolean);

  await notifyTelegram(lines.join("\n"));
}
