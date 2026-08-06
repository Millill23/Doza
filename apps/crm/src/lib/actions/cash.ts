"use server";

import { prisma } from "@doza/db";
import { getBalance, earnPoints, spendPoints } from "@doza/db/loyalty";
import {
  pickActivePromo,
  getGlobalPromo,
  getActiveSuperPromo,
  getCashbackRates,
} from "@doza/db/promos";
import { priceCart } from "@doza/db/pricing";
import { createSmsCode, verifySmsCode } from "@doza/db/sms-codes";
import { normalizePhone } from "@doza/shared";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { notifyTelegram } from "@/lib/telegram";

/** Отправить покупателю SMS-код для подтверждения списания баллов. */
export async function requestLoyaltySpendOtp(phoneRaw: string, amount: number) {
  await requireRole(["admin", "seller"]);
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) throw new Error("Некорректный телефон");
  if (amount <= 0) throw new Error("Укажите количество баллов");

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) throw new Error("Клиент не найден");
  const balance = await getBalance(customer.id);
  if (balance <= 0) throw new Error("У клиента нет баллов");

  const code = await createSmsCode(phone, "loyalty_spend", { amount });
  const sms = await sendSms(
    phone,
    `${code} - Код подтверждения для списания ${amount} баллов`,
  );
  return { ok: true, smsSent: sms.ok, balance };
}

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Человекочитаемое название сработавшей механики скидки. */
const DISCOUNT_LABEL: Record<string, string> = {
  vip: "VIP",
  social: "за подписки",
  promo: "акция",
  super: "супер-акция",
  none: "",
};

/** Баллы в SMS: без лишних нулей (12 вместо 12.00, но 12.5 — как есть). */
function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export interface CashItemInput {
  productId: number;
  volumeMl: number;
  qty: number;
  atomizerId?: number | null;
}

/** Поиск клиента по телефону + баланс баллов. */
export async function lookupCustomer(phoneRaw: string) {
  await requireRole(["admin", "seller"]);
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 9) return { found: false, name: null, balance: 0 };

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true, vipCardNumber: true },
  });
  if (!customer)
    return { found: false, name: null, balance: 0, vipCard: null, vipPercent: 0 };

  const balance = await getBalance(customer.id);
  const vipPercent = customer.vipCardNumber
    ? await getSetting("vip_discount_percent", 20)
    : 0;
  return {
    found: true,
    name: customer.name,
    balance,
    vipCard: customer.vipCardNumber,
    vipPercent,
  };
}

interface CreateSaleInput {
  items: CashItemInput[];
  certificates?: { denomination: number; qty: number }[];
  phone?: string;
  name?: string;
  loyaltySpend?: number;
  loyaltyOtp?: string;
  /** Скидка 5% за подписку в соцсетях. */
  socialSubscribe?: boolean;
  /** Скидка 5% за отметку в сторис. */
  socialStory?: boolean;
  /** Оформить продажу от лица другого продавца (только админ). */
  sellerId?: number;
}

/** Создать и сразу закрыть оффлайн-продажу. */
export async function createOfflineSale(input: CreateSaleInput) {
  const session = await requireRole(["admin", "seller"]);
  const actorId = Number(session.user.id);

  // Продажу можно записать на другого продавца — но только админу.
  let sellerId = actorId;
  let createdById: number | null = null;
  if (input.sellerId && Number(input.sellerId) !== actorId) {
    if (session.user.role !== "admin")
      throw new Error("Недостаточно прав для продажи от лица сотрудника");
    const target = await prisma.crmUser.findUnique({
      where: { id: Number(input.sellerId) },
      select: { id: true, isActive: true, role: true },
    });
    if (!target || !target.isActive) throw new Error("Сотрудник не найден");
    if (target.role === "marketer")
      throw new Error("Маркетолог не может быть продавцом");
    sellerId = target.id;
    createdById = actorId; // фиксируем, кто фактически пробил чек
  }

  const items = Array.isArray(input.items) ? input.items : [];
  const certs = (Array.isArray(input.certificates) ? input.certificates : [])
    .map((c) => ({
      denomination: Math.round(Number(c.denomination) * 100) / 100,
      qty: Math.max(1, Math.floor(c.qty || 1)),
    }))
    .filter((c) => c.denomination > 0);
  if (items.length === 0 && certs.length === 0)
    throw new Error("Корзина пуста");

  // Пересчёт цен на сервере
  const volumeRecords = await prisma.productVolume.findMany({
    where: {
      isActive: true,
      OR: items.map((i) => ({ productId: i.productId, volumeMl: i.volumeMl })),
    },
  });
  const priceMap = new Map<string, number>();
  for (const v of volumeRecords)
    priceMap.set(`${v.productId}:${v.volumeMl}`, Number(v.priceByn));

  let total = 0;
  const resolved = items.map((i) => {
    const price = priceMap.get(`${i.productId}:${i.volumeMl}`);
    if (price == null) throw new Error("Позиция недоступна");
    const qty = Math.max(1, Math.floor(i.qty || 1));
    total += price * qty;
    return { ...i, qty, priceByn: price };
  });
  total = Math.round(total * 100) / 100;

  // Клиент (опционально)
  let customerId: number | null = null;
  let vipCard: string | null = null;
  if (input.phone) {
    const phone = normalizePhone(input.phone);
    if (phone.length >= 9) {
      const customer = await prisma.customer.upsert({
        where: { phone },
        update: input.name ? { name: input.name } : {},
        create: { phone, name: input.name?.trim() || "Покупатель" },
      });
      customerId = customer.id;
      vipCard = customer.vipCardNumber;
    }
  }

  // Скидки. Правило: акции НЕ складываются — движок сравнивает сценарии
  // (VIP / за подписки / супер-акция) и берёт выгодный покупателю.
  const vipPct = vipCard ? await getSetting("vip_discount_percent", 20) : 0;

  const [subscribePct, storyPct] = await Promise.all([
    input.socialSubscribe ? getSetting("social_subscribe_percent", 5) : 0,
    input.socialStory ? getSetting("social_story_percent", 5) : 0,
  ]);
  // Подписка и сторис — одна механика, поэтому суммируются между собой.
  const socialPct = subscribePct + storyPct;

  const [globalPromo, superPromo, promoRows] = await Promise.all([
    getGlobalPromo(),
    getActiveSuperPromo(),
    prisma.promo.findMany({
      where: { productId: { in: resolved.map((r) => r.productId) } },
      select: {
        productId: true,
        discountPercent: true,
        cashbackPercent: true,
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  const promosByProduct = new Map<number, typeof promoRows>();
  for (const pr of promoRows) {
    if (pr.productId == null) continue;
    const arr = promosByProduct.get(pr.productId) ?? [];
    arr.push(pr);
    promosByProduct.set(pr.productId, arr);
  }
  const productPromoPercent: Record<number, number> = {};
  for (const r of resolved) {
    const promo = pickActivePromo(
      (promosByProduct.get(r.productId) ?? []).map((pr) => ({
        discountPercent: pr.discountPercent != null ? Number(pr.discountPercent) : null,
        cashbackPercent: pr.cashbackPercent != null ? Number(pr.cashbackPercent) : null,
        startsAt: pr.startsAt,
        endsAt: pr.endsAt,
      })),
    );
    productPromoPercent[r.productId] = promo.discountPercent;
  }

  const priced = priceCart({
    lines: resolved.map((r) => ({
      productId: r.productId,
      qty: r.qty,
      unitPrice: r.priceByn,
    })),
    vipPercent: vipPct,
    socialPercent: socialPct,
    productPromoPercent,
    allProductsPromoPercent: globalPromo.discountPercent,
    superPromo,
  });
  const netTotal = priced.net;

  // Сертификаты: как и раньше, только VIP-скидка; кешбек НЕ начисляется.
  // Акции (в т.ч. супер-акция) на номиналы сертификатов не распространяются.
  const certGross = certs.reduce((s, c) => s + c.denomination * c.qty, 0);
  const certDiscount =
    vipPct > 0 ? Math.round(certGross * (vipPct / 100) * 100) / 100 : 0;
  const certNet = Math.round((certGross - certDiscount) * 100) / 100;

  const saleTotal = Math.round((netTotal + certNet) * 100) / 100;
  const totalDiscount =
    Math.round((total - netTotal + certDiscount) * 100) / 100;

  // Списание баллов — требует подтверждения кодом из SMS
  let loyaltySpent = 0;
  if (customerId && input.loyaltySpend && input.loyaltySpend > 0) {
    const phone = normalizePhone(input.phone ?? "");
    const otp = await verifySmsCode(phone, "loyalty_spend", input.loyaltyOtp ?? "");
    if (!otp.ok) {
      throw new Error(
        otp.error ?? "Списание баллов не подтверждено кодом из SMS",
      );
    }
    const balance = await getBalance(customerId);
    loyaltySpent = Math.min(input.loyaltySpend, balance, saleTotal);
    loyaltySpent = Math.round(loyaltySpent * 100) / 100;
  }

  // Создание закрытой продажи
  const sale = await prisma.offlineSale.create({
    data: {
      sellerId,
      createdById,
      discountKind: priced.discount > 0 ? priced.kind : null,
      customerId,
      status: "closed",
      totalByn: saleTotal,
      discountByn: totalDiscount,
      loyaltySpentByn: loyaltySpent,
      closedAt: new Date(),
      items: {
        create: resolved.map((r) => ({
          productId: r.productId,
          volumeMl: r.volumeMl,
          qty: r.qty,
          priceByn: r.priceByn,
          atomizerId: r.atomizerId ?? null,
        })),
      },
      certificates: certs.length
        ? { create: certs.map((c) => ({ denomination: c.denomination, qty: c.qty })) }
        : undefined,
    },
  });

  // Списание остатков
  for (const r of resolved) {
    const delta = -(r.volumeMl * r.qty);
    await prisma.inventory.upsert({
      where: { productId: r.productId },
      update: { quantityMl: { increment: delta } },
      create: { productId: r.productId, quantityMl: 0 },
    });
    await prisma.inventoryLog.create({
      data: {
        productId: r.productId,
        deltaMl: delta,
        reason: "offline_sale",
        refType: "offline_sale",
        refId: sale.id,
        // В журнале остатков фиксируем того, кто фактически провёл операцию.
        userId: actorId,
      },
    });
  }

  // Баллы: списание и начисление
  let earned = 0;
  if (customerId) {
    if (loyaltySpent > 0) {
      await spendPoints(customerId, loyaltySpent, {
        type: "offline_sale",
        id: sale.id,
      });
    }
    const days = await getSetting("loyalty_days", 180);
    // Кешбек только с товаров (не с сертификатов). Процент берётся по каждому
    // товару отдельно — включая повышенный кешбек акции, как обещает витрина.
    const rates = await getCashbackRates(resolved.map((r) => r.productId));
    // Списанные баллы уменьшают базу начисления — распределяем пропорционально.
    const base = Math.max(0, netTotal - loyaltySpent);
    const ratio = netTotal > 0 ? base / netTotal : 0;
    earned =
      Math.round(
        priced.lineNet.reduce((sum, lineNet, i) => {
          const pct = rates[resolved[i].productId] ?? 0;
          return sum + lineNet * ratio * (pct / 100);
        }, 0) * 100,
      ) / 100;
    if (earned > 0) {
      await earnPoints(customerId, earned, days, {
        type: "offline_sale",
        id: sale.id,
      });
    }
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastPurchaseAt: new Date(), lastPurchaseSum: saleTotal },
    });
  }

  // SMS покупателю о покупке и бонусах (сбой не должен ронять продажу).
  if (customerId && input.phone) {
    try {
      const balance = await getBalance(customerId);
      const text =
        earned > 0
          ? `Спасибо за покупку! Вам начислено ${fmtPoints(earned)} бонусов. Всего бонусов: ${fmtPoints(balance)}`
          : `Спасибо за покупку! Всего бонусов: ${fmtPoints(balance)}`;
      await sendSms(normalizePhone(input.phone), text);
    } catch (e) {
      console.error("[cash] sms о покупке не отправлена:", e);
    }
  }

  // TG-оповещение о продаже (не блокирует ответ при сбое)
  try {
    const prods = await prisma.product.findMany({
      where: { id: { in: resolved.map((r) => r.productId) } },
      select: { id: true, name: true, brand: { select: { name: true } } },
    });
    const nameMap = new Map(prods.map((p) => [p.id, `${p.brand.name} ${p.name}`]));
    const [seller, actor] = await Promise.all([
      prisma.crmUser.findUnique({ where: { id: sellerId }, select: { name: true } }),
      createdById
        ? prisma.crmUser.findUnique({ where: { id: createdById }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    const lines = resolved
      .map(
        (r) =>
          `• ${nameMap.get(r.productId) ?? "?"} — ${r.volumeMl} мл ×${r.qty} = ${(
            r.priceByn * r.qty
          ).toFixed(2)} BYN`,
      )
      .join("\n");
    const certLines = certs
      .map((c) => `• 🎁 Сертификат ${c.denomination.toFixed(0)} BYN ×${c.qty}`)
      .join("\n");
    const allLines = [lines, certLines].filter(Boolean).join("\n");
    const grossAll = Math.round((total + certGross) * 100) / 100;
    const customerLine = customerId
      ? `${input.name?.trim() || "Покупатель"}${input.phone ? ` (${normalizePhone(input.phone)})` : ""}`
      : "без клиента";
    await notifyTelegram(
      `🧾 <b>Оффлайн-продажа #${sale.id}</b>\n` +
        `Продавец: ${seller?.name ?? sellerId}` +
        (actor ? ` (оформил ${actor.name})` : "") +
        `\nКлиент: ${customerLine}${vipCard ? ` ⭐VIP №${vipCard}` : ""}\n${allLines}\n` +
        (totalDiscount > 0
          ? `Сумма: ${grossAll.toFixed(2)} BYN\nСкидка: −${totalDiscount.toFixed(2)}${DISCOUNT_LABEL[priced.kind] ? ` (${DISCOUNT_LABEL[priced.kind]})` : ""}\n`
          : "") +
        `Итого: <b>${saleTotal.toFixed(2)} BYN</b>` +
        (loyaltySpent > 0 ? `\nСписано баллов: ${loyaltySpent.toFixed(2)}` : ""),
    );
  } catch (e) {
    console.error("[cash] telegram notify failed:", e);
  }

  revalidatePath("/cash");
  revalidatePath("/");

  return {
    saleId: sale.id,
    total: saleTotal,
    discount: totalDiscount,
    /** Какая механика сработала — показываем продавцу в итогах чека. */
    discountKind: priced.discount > 0 ? priced.kind : "none",
    discountLabel: priced.discount > 0 ? (DISCOUNT_LABEL[priced.kind] ?? "") : "",
    freeUnits: priced.freeUnits,
    earned,
    loyaltySpent,
    toPay: Math.round((saleTotal - loyaltySpent) * 100) / 100,
  };
}
