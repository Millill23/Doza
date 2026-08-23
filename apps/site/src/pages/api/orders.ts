import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { getBalance, spendPoints } from "@doza/db/loyalty";
import { requestConsent } from "@doza/db/consent";
import { createPaymentAttempt, refundOrderPoints } from "@doza/db/payments";
import { assertBelarusPhone } from "@doza/shared/phone";
import { assertCustomerName } from "@doza/shared/customer-name";
import {
  validateDelivery,
  normalizeDelivery,
  type DeliveryDetails,
} from "@doza/shared/delivery";
import { sendSms } from "@doza/shared/sms";
import { createCardCheckout } from "@doza/shared/bepaid";
import { notifyTelegram } from "../../lib/telegram";
import { onOrderPaid } from "../../lib/order-paid";
import { currentCustomerId } from "../../lib/customer-auth";
import { quoteCart, vipPercentFor, CartError } from "../../lib/cart-pricing";
import {
  DELIVERY_CHOICES,
  deliveryCost,
  needsPostalAddress,
  needsOffice,
  type DeliveryTypeValue,
} from "@doza/db/delivery-rules";

export const prerender = false;

/** Сколько у покупателя есть времени на оплату, прежде чем заказ отменится. */
const PAYMENT_TTL_MS = 60 * 60 * 1000;

interface IncomingItem {
  productId: number;
  volumeMl: number;
  qty: number;
  /**
   * Позиция взята из допродажи. Само по себе это ничего не даёт: право на
   * скидку сервер подтверждает своим списком предложенного (`quoteCart`).
   */
  fromUpsell?: boolean;
}

interface OrderBody {
  name: string;
  phone: string;
  deliveryType: DeliveryTypeValue;
  /** Данные посылки. Присылаются только для Белпочты. */
  delivery?: Partial<DeliveryDetails>;
  /** Получатель для Европочты: ФИО, телефон и код отделения. */
  europost?: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    phone?: string;
    officeCode?: string;
  };
  comment?: string;
  items: IncomingItem[];
  loyaltySpend?: number;
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: OrderBody;
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const deliveryType = body.deliveryType;
  const items = Array.isArray(body.items) ? body.items : [];

  // Вошедший в кабинет покупатель опознаётся по сессии. Присланные имя и
  // телефон для него не значат ничего: карта привязана к аккаунту, и скидку по
  // ней нельзя получить, просто набрав в форме чужой номер.
  const sessionCustomerId = await currentCustomerId(cookies);
  const account = sessionCustomerId
    ? await prisma.customer.findUnique({
        where: { id: sessionCustomerId },
        select: { id: true, name: true, phone: true },
      })
    : null;

  // Имя уходит в SMS и Telegram, телефон становится идентификатором клиента —
  // проверяем оба, не полагаясь на маску в браузере.
  let name: string;
  let phone: string;
  try {
    name = account ? account.name : assertCustomerName(body.name ?? "");
    phone = account ? account.phone : assertBelarusPhone(body.phone ?? "");
  } catch (e) {
    return bad((e as Error).message);
  }
  if (!DELIVERY_CHOICES.includes(deliveryType))
    return bad("Выберите способ получения");

  // Данные посылки проверяем и здесь: браузерная проверка — подсказка, а не
  // гарантия. Неполный адрес всплывёт только на почте, когда деньги уже взяты.
  let shipTo: DeliveryDetails | null = null;
  if (needsPostalAddress(deliveryType)) {
    const bad_ = validateDelivery(body.delivery ?? {});
    if (bad_) return bad(bad_);
    shipTo = normalizeDelivery(body.delivery as DeliveryDetails);
  }

  // Европочта: адрес не нужен, посылку выдают по ФИО и телефону в отделении.
  let office: { code: string; text: string } | null = null;
  let recipient: {
    lastName: string;
    firstName: string;
    middleName: string;
    phone: string;
  } | null = null;
  if (needsOffice(deliveryType)) {
    const e = body.europost ?? {};
    const fio = [e.lastName, e.firstName, e.middleName]
      .map((s) => (s ?? "").trim());
    if (fio.some((s) => !s)) return bad("Укажите фамилию, имя и отчество получателя");

    let recipientPhone: string;
    try {
      recipientPhone = assertBelarusPhone(e.phone ?? "");
    } catch {
      return bad("Укажите телефон получателя — по нему выдают посылку");
    }

    const code = (e.officeCode ?? "").trim();
    if (!code) return bad("Выберите отделение Европочты");
    // Отделение сверяем со справочником: код из браузера может быть любым, а
    // посылку повезут по нему.
    const found = await prisma.europostOffice.findUnique({ where: { code } });
    if (!found || !found.isActive)
      return bad("Такого отделения нет в списке — выберите другое");

    office = { code: found.code, text: found.address };
    recipient = {
      lastName: fio[0],
      firstName: fio[1],
      middleName: fio[2],
      phone: recipientPhone,
    };
  }
  if (items.length === 0) return bad("Корзина пуста");

  // Пересчёт цен на сервере — клиентским ценам не доверяем. Тот же расчёт, что
  // показывала корзина, поэтому сумма на платёжной странице совпадёт с той,
  // которую покупатель видел.
  const vipPercent = await vipPercentFor(sessionCustomerId);
  let quote;
  try {
    quote = await quoteCart(items, { vipPercent });
  } catch (e) {
    if (e instanceof CartError) return bad(e.message);
    throw e;
  }
  const orderItems = quote.lines;
  const total = quote.net;

  // Доставка. Порог считается по сумме товаров до списания баллов: баллы —
  // способ оплаты, а не уменьшение заказа.
  const delivery = deliveryCost({ type: deliveryType, goodsTotal: total });

  // Клиент (upsert по телефону)
  const existing = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true },
  });
  const customer = await prisma.customer.upsert({
    where: { phone },
    // Имя записываем только при создании. Раньше оно перезаписывалось на
    // каждом заказе — и любой, кто знал чужой номер, мог переименовать чужую
    // карточку, просто оформив заказ на этот телефон. Своё имя покупатель
    // меняет в личном кабинете.
    update: {},
    create: { phone, name },
  });

  // Новичку сразу предлагаем вступить в программу лояльности. Постоянным с
  // неподтверждённым согласием тут ничего не шлём: иначе каждый их заказ
  // превращался бы в напоминание. Для них есть ручная отправка из CRM.
  if (!existing) {
    await requestConsent(customer.id, sendSms, "invite", { notify: notifyTelegram }).catch((e) =>
      console.error("[orders] не удалось запросить согласие:", e),
    );
  }

  // Списание баллов (FIFO), не больше баланса и суммы заказа
  let loyaltySpent = 0;
  const requested = Math.max(0, Number(body.loyaltySpend || 0));
  if (requested > 0) {
    const balance = await getBalance(customer.id);
    const allowed = Math.min(requested, balance, total);
    if (allowed > 0) {
      // заказ ещё не создан — спишем после создания, чтобы привязать ref
      loyaltySpent = Math.round(allowed * 100) / 100;
    }
  }

  // Создание заказа
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      customerName: name,
      customerPhone: phone,
      status: "new",
      deliveryType,
      ...(shipTo
        ? {
            recipientLastName: shipTo.lastName,
            recipientFirstName: shipTo.firstName,
            recipientMiddleName: shipTo.middleName,
            postalCode: shipTo.postalCode,
            region: shipTo.region,
            city: shipTo.city,
            address: shipTo.address,
          }
        : {}),
      ...(office && recipient
        ? {
            europostOfficeCode: office.code,
            europostOfficeText: office.text,
            recipientPhone: recipient.phone,
            recipientLastName: recipient.lastName,
            recipientFirstName: recipient.firstName,
            recipientMiddleName: recipient.middleName,
          }
        : {}),
      comment: (body.comment ?? "").trim() || null,
      totalByn: total,
      deliveryFeeByn: delivery.fee,
      loyaltySpentByn: loyaltySpent,
      items: {
        create: orderItems.map((i) => ({
          productId: i.productId,
          volumeMl: i.volumeMl,
          qty: i.qty,
          priceByn: i.priceByn,
        })),
      },
    },
  });

  // Фактическое списание баллов с привязкой к заказу
  if (loyaltySpent > 0) {
    await spendPoints(customer.id, loyaltySpent, {
      type: "order",
      id: order.id,
    });
  }

  const toPay =
    Math.round((total + delivery.fee - loyaltySpent) * 100) / 100;

  // Заказ бесплатным быть не может: если баллы покрыли всё, платить нечем и
  // платёжную страницу создавать не за что.
  if (toPay <= 0) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    // Тот же путь, что и у оплаченного картой: остатки списываются, кешбек
    // начисляется, продавцам и покупателю уходят уведомления.
    await onOrderPaid(order.id, "оплачен баллами");
    return json({ ok: true, orderId: order.id, total, toPay, paid: true }, 201);
  }

  // Создаём платёжную страницу. Уведомление продавцам шлём не сейчас, а после
  // оплаты: заказ, брошенный на странице банка, продавцу не нужен.
  const origin = new URL(request.url).origin;
  let redirectUrl: string;
  try {
    const checkout = await createCardCheckout({
      amountByn: toPay,
      description: `Заказ №${order.id} — DOZA`,
      trackingId: String(order.id),
      customer: { firstName: name, phone: `+${phone}` },
      positions: orderItems.map((i) => ({
        name: i.label,
        priceByn: i.priceByn,
        quantity: i.qty,
      })),
      successUrl: `${origin}/payment/success`,
      declineUrl: `${origin}/payment/fail`,
      failUrl: `${origin}/payment/fail`,
      cancelUrl: `${origin}/payment/fail`,
      notificationUrl: `${origin}/api/payments/webhook`,
      expiredAt: new Date(Date.now() + PAYMENT_TTL_MS),
    });
    await createPaymentAttempt({
      orderId: order.id,
      token: checkout.token,
      amountByn: toPay,
    });
    redirectUrl = checkout.redirectUrl;
  } catch (e) {
    // Платёжная страница не создалась — заказ есть, но оплатить его нечем.
    // Возвращаем баллы сразу, иначе они зависнут списанными.
    console.error("[orders] не удалось создать платёж:", e);
    await refundOrderPoints(order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "failed", status: "rejected" },
    });
    return bad(
      "Не удалось перейти к оплате. Попробуйте ещё раз или свяжитесь с нами.",
      502,
    );
  }

  return json({ ok: true, orderId: order.id, total, toPay, redirectUrl }, 201);
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
