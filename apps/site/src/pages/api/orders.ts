import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { getBalance, spendPoints } from "@doza/db/loyalty";
import { normalizePhone, formatByn } from "@doza/shared";
import { notifyTelegram } from "../../lib/telegram";

export const prerender = false;

interface IncomingItem {
  productId: number;
  volumeMl: number;
  qty: number;
}

interface OrderBody {
  name: string;
  phone: string;
  deliveryType: "pickup" | "post";
  address?: string;
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

export const POST: APIRoute = async ({ request }) => {
  let body: OrderBody;
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const name = (body.name ?? "").trim();
  const phone = normalizePhone(body.phone ?? "");
  const deliveryType = body.deliveryType;
  const items = Array.isArray(body.items) ? body.items : [];

  if (name.length < 2) return bad("Укажите имя");
  if (phone.length < 9) return bad("Укажите корректный номер телефона");
  if (deliveryType !== "pickup" && deliveryType !== "post")
    return bad("Выберите способ получения");
  if (deliveryType === "post" && !(body.address ?? "").trim())
    return bad("Укажите адрес доставки");
  if (items.length === 0) return bad("Корзина пуста");

  // Пересчёт цен на сервере — клиентским ценам не доверяем
  const volumeRecords = await prisma.productVolume.findMany({
    where: {
      isActive: true,
      OR: items.map((i) => ({
        productId: i.productId,
        volumeMl: i.volumeMl,
      })),
    },
    include: { product: { select: { name: true, brand: { select: { name: true } } } } },
  });

  const priceMap = new Map<string, (typeof volumeRecords)[number]>();
  for (const v of volumeRecords) priceMap.set(`${v.productId}:${v.volumeMl}`, v);

  let total = 0;
  const orderItems: {
    productId: number;
    volumeMl: number;
    qty: number;
    priceByn: number;
    label: string;
  }[] = [];

  for (const item of items) {
    const rec = priceMap.get(`${item.productId}:${item.volumeMl}`);
    const qty = Math.max(1, Math.floor(item.qty || 1));
    if (!rec) return bad(`Позиция недоступна (товар ${item.productId})`);
    const price = Number(rec.priceByn);
    total += price * qty;
    orderItems.push({
      productId: item.productId,
      volumeMl: item.volumeMl,
      qty,
      priceByn: price,
      label: `${rec.product.brand.name} ${rec.product.name}, ${item.volumeMl} мл ×${qty}`,
    });
  }
  total = Math.round(total * 100) / 100;

  // Клиент (upsert по телефону)
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: { name },
    create: { phone, name },
  });

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
      address: deliveryType === "post" ? (body.address ?? "").trim() : null,
      comment: (body.comment ?? "").trim() || null,
      totalByn: total,
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

  // Telegram-уведомление продавцам
  const toPay = Math.round((total - loyaltySpent) * 100) / 100;
  const lines = [
    `🆕 <b>Новый заказ #${order.id}</b>`,
    ``,
    `👤 ${name}`,
    `📞 +${phone}`,
    `🚚 ${deliveryType === "pickup" ? "Самовывоз" : "Доставка почтой"}`,
    deliveryType === "post" && body.address ? `📍 ${body.address}` : "",
    ``,
    `<b>Состав:</b>`,
    ...orderItems.map((i) => `• ${i.label} — ${formatByn(i.priceByn * i.qty)}`),
    ``,
    `Сумма: <b>${formatByn(total)}</b>`,
    loyaltySpent > 0 ? `Списано баллов: ${formatByn(loyaltySpent)}` : "",
    `К оплате при получении: <b>${formatByn(toPay)}</b>`,
    body.comment ? `\n💬 ${body.comment}` : "",
  ].filter(Boolean);

  await notifyTelegram(lines.join("\n"));

  return new Response(JSON.stringify({ ok: true, orderId: order.id, total, toPay }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
