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
import { lookupCertificate, redeemCertificate } from "@doza/db/certificates";
import { requestConsent } from "@doza/db/consent";
import { activeDateReward, consumeDateReward } from "@doza/db/rewards";
import { sendSmsFromCrm } from "@/lib/sms";
import { toStoredPhone } from "@doza/shared/phone";
import { assertCustomerName } from "@doza/shared/customer-name";
import { sendSms } from "@doza/shared/sms";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { notifyTelegram, tgEscape } from "@/lib/telegram";

/** Отказ, понятный продавцу. Форма ответа общая с успешной веткой. */
function fail(error: string) {
  return { ok: false as const, error, smsSent: false, balance: 0 };
}

/** Отправить покупателю SMS-код для подтверждения списания баллов. */
export async function requestLoyaltySpendOtp(phoneRaw: string, amount: number) {
  const session = await requireRole(["admin", "seller"]);
  // Приводим к хранимому виду: поле ввода отдаёт девять цифр без префикса, и
  // прежний `normalizePhone` пропускал их как есть — поиск шёл по «291234567»,
  // клиент не находился, а продавец видел лишь «ошибка сервера».
  const phone = toStoredPhone(phoneRaw);

  // Ожидаемые отказы возвращаем значением, а не исключением: в production
  // Next.js прячет текст ошибки server action за digest, и до продавца
  // доходила бы бессмысленная строка вместо причины.
  if (phone.length < 12) return fail("Некорректный телефон");
  if (amount <= 0) return fail("Укажите количество баллов");

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) return fail("Клиент не найден — проверьте номер");
  const balance = await getBalance(customer.id);
  if (balance <= 0) return fail("У клиента нет баллов");

  const code = await createSmsCode(phone, "loyalty_spend", { amount });
  const sms = await sendSmsFromCrm({
    kind: "otp_loyalty_spend",
    phone,
    text: `${code} - Код подтверждения для списания ${amount} баллов`,
    customerId: customer.id,
    userId: Number(session.user.id),
  });
  return { ok: true as const, error: null, smsSent: sms.ok, balance };
}

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? Number(s.value) : fallback;
}

/** Человекочитаемое название сработавшей механики скидки. */
const DISCOUNT_LABEL: Record<string, string> = {
  vip: "VIP",
  social: "за подписки",
  date: "по памятной дате",
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
  const phone = toStoredPhone(phoneRaw);
  const miss = {
    found: false as const,
    id: null,
    dateReward: null,
    name: null,
    balance: 0,
    vipCard: null,
    vipPercent: 0,
    hasConsent: false,
  };
  if (phone.length < 9) return miss;

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true, vipCardNumber: true, consentStatus: true },
  });
  if (!customer) return miss;

  const balance = await getBalance(customer.id);
  const vipPercent = customer.vipCardNumber
    ? await getSetting("vip_discount_percent", 20)
    : 0;
  const reward = await activeDateReward(customer.id);
  return {
    found: true as const,
    id: customer.id,
    /** Действующая скидка по памятной дате — продавец предлагает её покупателю. */
    dateReward: reward
      ? {
          id: reward.id,
          percent: reward.percent,
          description: reward.description,
          validUntil: reward.validUntil.toISOString(),
        }
      : null,
    name: customer.name,
    balance,
    vipCard: customer.vipCardNumber,
    vipPercent,
    // Без согласия баллы не начисляются — продавец должен это видеть до того,
    // как пробьёт чек и пообещает покупателю бонусы.
    hasConsent: customer.consentStatus === "confirmed",
  };
}

interface CreateSaleInput {
  items: CashItemInput[];
  /** Номер уже зарегистрированного клиента. Незнакомый номер просто игнорируется. */
  phone?: string;
  loyaltySpend?: number;
  loyaltyOtp?: string;
  /** Скидка 5% за подписку в соцсетях. */
  socialSubscribe?: boolean;
  /** Скидка 5% за отметку в сторис. */
  socialStory?: boolean;
  /** Применить разовую скидку по памятной дате (покупатель согласился). */
  useDateReward?: boolean;
  /**
   * Код подарочного сертификата. Оплата им не требует ни телефона, ни
   * согласия на обработку данных — сертификат на предъявителя.
   */
  certificateCode?: string;
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

  // Сертификаты продаются в отдельном разделе «Сертификаты», не через кассу —
  // поэтому и списать баллы на их покупку здесь невозможно.
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) throw new Error("Корзина пуста");

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
  let customerName: string | null = null;
  let vipCard: string | null = null;
  if (input.phone) {
    // Касса только привязывает чек к существующему клиенту. Заводить нового
    // отсюда нельзя: регистрация — единая точка в разделе «Клиенты», иначе в
    // базе плодятся безымянные «Покупатели» без согласия и памятных дат.
    const phone = toStoredPhone(input.phone);
    const customer = await prisma.customer.findUnique({ where: { phone } });
    if (customer) {
      customerId = customer.id;
      customerName = customer.name;
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

  // Скидку по памятной дате применяем, только если продавец её включил:
  // покупатель вправе отказаться и приберечь на следующую покупку.
  let dateReward = null;
  if (customerId && input.useDateReward) {
    dateReward = await activeDateReward(customerId);
  }

  const priced = priceCart({
    lines: resolved.map((r) => ({
      productId: r.productId,
      qty: r.qty,
      unitPrice: r.priceByn,
    })),
    vipPercent: vipPct,
    socialPercent: socialPct,
    datePercent: dateReward?.percent ?? 0,
    productPromoPercent,
    allProductsPromoPercent: globalPromo.discountPercent,
    superPromo,
  });
  const netTotal = priced.net;

  const saleTotal = netTotal;
  const totalDiscount = Math.round((total - netTotal) * 100) / 100;

  // Списание баллов — требует подтверждения кодом из SMS
  let loyaltySpent = 0;
  if (customerId && input.loyaltySpend && input.loyaltySpend > 0) {
    const phone = toStoredPhone(input.phone ?? "");
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

  // Сертификат проверяем до создания продажи: если код просрочен или пуст,
  // чек не должен появиться в базе с несуществующей оплатой.
  const certCode = (input.certificateCode ?? "").trim();
  const dueAfterPoints = Math.round((saleTotal - loyaltySpent) * 100) / 100;
  if (certCode) {
    const found = await lookupCertificate(certCode);
    if (!found.ok) throw new Error(found.reason ?? "Сертификат недоступен");
    if (dueAfterPoints <= 0)
      throw new Error(
        "Чек уже покрыт баллами — списывать с сертификата нечего. Уберите одно из двух.",
      );
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
    },
  });

  // Оплата сертификатом. Списываем после создания чека: списание без чека —
  // это деньги, которые некуда вернуть при отмене.
  let certPaid = 0;
  let certRemaining = 0;
  if (certCode) {
    const red = await redeemCertificate({
      code: certCode,
      saleId: sale.id,
      due: dueAfterPoints,
      userId: actorId,
    });
    certPaid = red.applied;
    certRemaining = red.remaining;
  }

  // Скидку списываем, только если она действительно сработала. Когда выгоднее
  // оказались VIP или акция, разовая скидка остаётся у клиента на следующий раз.
  let dateRewardUsed = false;
  if (dateReward && priced.kind === "date") {
    dateRewardUsed = await consumeDateReward(dateReward.id, sale.id);
  }

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
  // Кешбек посчитан, но не начислен из-за отсутствия согласия на обработку ПД.
  let cashbackBlocked = false;
  if (customerId) {
    if (loyaltySpent > 0) {
      await spendPoints(customerId, loyaltySpent, {
        type: "offline_sale",
        id: sale.id,
      });
    }
    const days = await getSetting("loyalty_days", 180);
    // Процент берётся по каждому товару отдельно — включая повышенный кешбек
    // акции, как обещает витрина.
    const rates = await getCashbackRates(resolved.map((r) => r.productId));
    // Кешбек считается со всей суммы покупки и не зависит от способа оплаты:
    // оплата баллами даёт такой же кешбек, как наличные или карта.
    const cashback =
      Math.round(
        priced.lineNet.reduce((sum, lineNet, i) => {
          const pct = rates[resolved[i].productId] ?? 0;
          return sum + lineNet * (pct / 100);
        }, 0) * 100,
      ) / 100;
    if (cashback > 0) {
      // Смотрим на фактический результат, а не на посчитанную сумму: без
      // согласия клиента начисления не будет, и обещать его нельзя ни продавцу
      // в итогах чека, ни покупателю в SMS.
      const accrued = await earnPoints(customerId, cashback, days, {
        type: "offline_sale",
        id: sale.id,
      });
      if (accrued) earned = cashback;
      else cashbackBlocked = true;
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
      const text = cashbackBlocked
        ? `Спасибо за покупку! Баллы не начислены: подтвердите согласие на обработку данных по ссылке из SMS.`
        : earned > 0
          ? `Спасибо за покупку! Вам начислено ${fmtPoints(earned)} баллов. Всего баллов: ${fmtPoints(balance)}`
          : `Спасибо за покупку! Всего баллов: ${fmtPoints(balance)}`;
      await sendSmsFromCrm({
        kind: "purchase",
        phone: toStoredPhone(input.phone),
        text,
        customerId,
        userId: actorId,
      });
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
    // Всё, что пришло от людей (названия, имена), экранируем — иначе символ
    // «<» в данных ломает разметку и Telegram отклоняет сообщение целиком.
    const nameMap = new Map(
      prods.map((p) => [p.id, tgEscape(`${p.brand.name} ${p.name}`)]),
    );
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
    const allLines = lines;
    const grossAll = total;
    const customerLine = customerId
      ? `${tgEscape(customerName ?? "")} (${toStoredPhone(input.phone ?? "")})`
      : "без клиента";
    await notifyTelegram(
      `🧾 <b>Оффлайн-продажа #${sale.id}</b>\n` +
        `Продавец: ${tgEscape(seller?.name ?? sellerId)}` +
        (actor ? ` (оформил ${tgEscape(actor.name)})` : "") +
        `\nКлиент: ${customerLine}${vipCard ? ` ⭐VIP №${tgEscape(vipCard)}` : ""}\n${allLines}\n` +
        (totalDiscount > 0
          ? `Сумма: ${grossAll.toFixed(2)} BYN\nСкидка: −${totalDiscount.toFixed(2)}${DISCOUNT_LABEL[priced.kind] ? ` (${DISCOUNT_LABEL[priced.kind]})` : ""}\n`
          : "") +
        `Итого: <b>${saleTotal.toFixed(2)} BYN</b>` +
        (loyaltySpent > 0 ? `\nСписано баллов: ${loyaltySpent.toFixed(2)}` : "") +
        (certPaid > 0
          ? `\n🎁 Сертификатом: ${certPaid.toFixed(2)} (остаток ${certRemaining.toFixed(2)})`
          : ""),
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
    /** Разовая скидка по дате списана — продавцу стоит это сказать покупателю. */
    dateRewardUsed,
    discountLabel: priced.discount > 0 ? (DISCOUNT_LABEL[priced.kind] ?? "") : "",
    freeUnits: priced.freeUnits,
    earned,
    /** Кешбек не начислен — клиент не подтвердил согласие на обработку ПД. */
    cashbackBlocked,
    loyaltySpent,
    /** Оплачено сертификатом по этому чеку. */
    certPaid,
    /** Что осталось на сертификате — продавец называет это покупателю. */
    certRemaining,
    toPay: Math.round((saleTotal - loyaltySpent - certPaid) * 100) / 100,
  };
}

/** Проверить код сертификата при покупателе — до закрытия чека. */
export async function checkCertificate(code: string) {
  await requireRole(["admin", "seller"]);
  return lookupCertificate(code);
}
