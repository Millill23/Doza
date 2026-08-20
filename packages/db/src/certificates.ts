/**
 * Подарочные сертификаты: работа с базой.
 *
 * Активировать сертификат можно двумя путями (продавец в CRM и клиент сам в
 * личном кабинете), поэтому сама операция живёт здесь — чтобы оба пути не
 * разъехались. Чистые правила (коды, размер начисления) — в `certificate-rules.ts`.
 */

import { prisma } from "./index";
import { earnPoints, getBalance } from "./loyalty";
import {
  generateCertificateCode,
  normalizeCertificateCode,
  isValidCertificateCode,
  certificateAward,
  certificateExpiresAt,
  canRedeem,
  canActivate,
  applyCertificate,
  type CertificateState,
} from "./certificate-rules";

// Реэкспорт правил, чтобы приложениям хватало одного импорта.
export * from "./certificate-rules";

/** Ошибка активации с понятным для продавца/клиента текстом. */
export class CertificateError extends Error {}

/**
 * Клиент не подтвердил согласие на обработку ПД — баллы начислить нельзя.
 *
 * Отдельный класс, а не просто текст: продавцу мало сообщения, ему нужна рядом
 * кнопка «отправить согласие», а для неё интерфейсу нужно знать и причину, и
 * id клиента.
 */
export class ConsentRequiredError extends CertificateError {
  constructor(readonly customerId: number) {
    super(
      "Клиент не подтвердил согласие на обработку персональных данных — начислить баллы нельзя.",
    );
  }
}

/** Привести запись из базы к виду, с которым работают чистые правила. */
function toState(cert: {
  status: string;
  balanceByn: unknown;
  denomination: unknown;
  expiresAt: Date;
}): CertificateState {
  return {
    status: cert.status as CertificateState["status"],
    balanceByn: Number(cert.balanceByn),
    denomination: Number(cert.denomination),
    expiresAt: cert.expiresAt,
  };
}

/**
 * Подобрать код, которого ещё нет в базе.
 * Коллизия при 32^8 ≈ 1.1e12 вариантов крайне маловероятна, но проверяем —
 * уникальный индекс всё равно не даст создать дубль.
 */
export async function reserveUniqueCode(attempts = 10): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = generateCertificateCode();
    const exists = await prisma.giftCertificate.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new CertificateError("Не удалось сгенерировать код, попробуйте ещё раз");
}

export interface ActivationResult {
  certificateId: number;
  code: string;
  denomination: number;
  /** Сколько баллов начислено. */
  awarded: number;
  /** Баланс клиента после начисления. */
  balance: number;
  customerId: number;
  customerName: string;
  customerPhone: string;
  /** Активировал VIP-клиент (начислена уплаченная сумма, а не номинал). */
  isVip: boolean;
}

/**
 * Активировать сертификат и начислить баллы.
 *
 * Смена статуса и начисление выполняются одной транзакцией, а статус меняется
 * условным UPDATE (…WHERE status = 'new'): если два продавца активируют один код
 * одновременно, выиграет только один — двойного начисления не будет.
 */
export async function activateCertificate(opts: {
  code: string;
  customerId: number;
  /** Сотрудник CRM или null, если клиент активировал сам на сайте. */
  activatedById?: number | null;
  loyaltyDays: number;
}): Promise<ActivationResult> {
  const code = normalizeCertificateCode(opts.code);
  if (!isValidCertificateCode(code))
    throw new CertificateError("Некорректный код сертификата");

  const cert = await prisma.giftCertificate.findUnique({ where: { code } });
  if (!cert) throw new CertificateError("Сертификат с таким кодом не найден");

  const usable = canActivate(toState(cert));
  if (!usable.ok) throw new CertificateError(usable.reason);

  const customer = await prisma.customer.findUnique({
    where: { id: opts.customerId },
    select: { id: true, name: true, phone: true, vipCardNumber: true },
  });
  if (!customer) throw new CertificateError("Клиент не найден");

  const isVip = Boolean(customer.vipCardNumber);
  const awarded = certificateAward({
    denomination: Number(cert.denomination),
    paidByn: Number(cert.paidByn),
    activatorIsVip: isVip,
  });

  await prisma.$transaction(async (tx) => {
    // Условный UPDATE — защита от повторной активации при гонке.
    // Условие по остатку, а не только по статусу: если параллельно прошла
    // оплата в кассе, остаток уже не полный — обменивать нечего.
    const claimed = await tx.giftCertificate.updateMany({
      where: { id: cert.id, status: "new", balanceByn: cert.denomination },
      data: {
        status: "activated",
        // Остаток обнуляем: номинал ушёл баллами, и платить им в кассе больше
        // нельзя — иначе магазин отдаст одну сумму дважды.
        balanceByn: 0,
        customerId: customer.id,
        activatedById: opts.activatedById ?? null,
        activatedAt: new Date(),
        awardedByn: awarded,
      },
    });
    if (claimed.count !== 1)
      throw new CertificateError("Сертификат уже использован");

    const accrued = await earnPoints(customer.id, awarded, opts.loyaltyDays, {
      type: "gift_certificate",
      id: cert.id,
    }, { tx, reason: `Активация сертификата ${code}` });

    // Без согласия на обработку ПД баллы не начисляются — а значит сертификат
    // сгорел бы впустую. Роняем транзакцию: код остаётся неактивированным,
    // клиент даёт согласие и активирует его заново.
    if (!accrued) throw new ConsentRequiredError(customer.id);
  });

  const balance = await getBalance(customer.id);

  return {
    certificateId: cert.id,
    code,
    denomination: Number(cert.denomination),
    awarded,
    balance,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    isVip,
  };
}

/** Дата сгорания для сертификата, выпускаемого сейчас. */
export function newCertificateExpiry(): Date {
  return certificateExpiresAt(new Date());
}

export interface CertificateLookup {
  ok: boolean;
  /** Причина отказа — показываем продавцу. */
  reason?: string;
  id?: number;
  code?: string;
  balance?: number;
  denomination?: number;
  expiresAt?: string;
}

/**
 * Найти сертификат по коду и сказать, можно ли им платить.
 *
 * Отдельно от списания: продавец сначала проверяет код при покупателе и видит
 * остаток, и только потом закрывает чек. Отказ возвращаем значением, а не
 * исключением — «сертификат просрочен» это не сбой, а нормальный ответ.
 */
export async function lookupCertificate(codeRaw: string): Promise<CertificateLookup> {
  const code = normalizeCertificateCode(codeRaw);
  if (!isValidCertificateCode(code))
    return { ok: false, reason: "Код состоит из 8 символов — проверьте ввод" };

  const cert = await prisma.giftCertificate.findUnique({ where: { code } });
  if (!cert) return { ok: false, reason: "Сертификат с таким кодом не найден" };

  const usable = canRedeem(toState(cert));
  if (!usable.ok) return { ok: false, reason: usable.reason };

  return {
    ok: true,
    id: cert.id,
    code: cert.code,
    balance: Number(cert.balanceByn),
    denomination: Number(cert.denomination),
    expiresAt: cert.expiresAt.toISOString(),
  };
}

export interface RedeemResult {
  certificateId: number;
  code: string;
  /** Списано с сертификата по этому чеку. */
  applied: number;
  /** Осталось на сертификате. */
  remaining: number;
}

/**
 * Списать с сертификата в счёт продажи.
 *
 * Списание идёт условным UPDATE по текущему остатку: если тем же кодом в этот
 * момент платят на второй кассе, выиграет только одна операция — иначе остаток
 * можно потратить дважды.
 *
 * Вызывается уже после создания продажи, поэтому `saleId` обязателен: списание
 * без чека — это потерянные деньги, которые некуда вернуть.
 */
export async function redeemCertificate(opts: {
  code: string;
  saleId: number;
  /** Сумма к оплате после скидок и списания баллов. */
  due: number;
  userId?: number | null;
}): Promise<RedeemResult> {
  const code = normalizeCertificateCode(opts.code);
  const cert = await prisma.giftCertificate.findUnique({ where: { code } });
  if (!cert) throw new CertificateError("Сертификат с таким кодом не найден");

  const usable = canRedeem(toState(cert));
  if (!usable.ok) throw new CertificateError(usable.reason);

  const { applied, remaining } = applyCertificate({
    balance: Number(cert.balanceByn),
    due: opts.due,
  });
  if (applied <= 0)
    throw new CertificateError("По этому чеку списывать с сертификата нечего");

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.giftCertificate.updateMany({
      where: { id: cert.id, balanceByn: cert.balanceByn, status: "new" },
      data: {
        balanceByn: remaining,
        // Пустой сертификат помечаем сразу: продавцу не придётся гадать,
        // почему код «есть, но не работает».
        ...(remaining <= 0 ? { status: "spent" as const } : {}),
      },
    });
    if (claimed.count !== 1)
      throw new CertificateError(
        "Сертификатом только что воспользовались — проверьте остаток заново",
      );

    await tx.certificateRedemption.create({
      data: {
        certificateId: cert.id,
        saleId: opts.saleId,
        amountByn: applied,
        balanceAfter: remaining,
        userId: opts.userId ?? null,
      },
    });

    return { certificateId: cert.id, code, applied, remaining };
  });
}

/**
 * Вернуть на сертификат всё, что списали по отменённой продаже.
 *
 * Срок действия при этом не продлевается: покупки не было, но и время не
 * повернулось вспять.
 */
export async function revokeSaleRedemptions(
  saleId: number,
  tx: {
    certificateRedemption: typeof prisma.certificateRedemption;
    giftCertificate: typeof prisma.giftCertificate;
  } = prisma,
): Promise<number> {
  const rows = await tx.certificateRedemption.findMany({
    where: { saleId, revokedAt: null },
  });

  let returned = 0;
  for (const r of rows) {
    const amount = Number(r.amountByn);
    await tx.giftCertificate.update({
      where: { id: r.certificateId },
      data: {
        balanceByn: { increment: amount },
        // Сертификат снова можно тратить: деньги на нём опять есть.
        status: "new",
      },
    });
    await tx.certificateRedemption.update({
      where: { id: r.id },
      data: { revokedAt: new Date() },
    });
    returned += amount;
  }
  return Math.round(returned * 100) / 100;
}
