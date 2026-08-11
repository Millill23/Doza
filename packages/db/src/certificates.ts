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
} from "./certificate-rules";

// Реэкспорт правил, чтобы приложениям хватало одного импорта.
export * from "./certificate-rules";

/** Ошибка активации с понятным для продавца/клиента текстом. */
export class CertificateError extends Error {}

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
  if (cert.status === "activated")
    throw new CertificateError("Сертификат уже активирован");
  if (cert.status === "cancelled")
    throw new CertificateError("Сертификат аннулирован");

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
    const claimed = await tx.giftCertificate.updateMany({
      where: { id: cert.id, status: "new" },
      data: {
        status: "activated",
        customerId: customer.id,
        activatedById: opts.activatedById ?? null,
        activatedAt: new Date(),
        awardedByn: awarded,
      },
    });
    if (claimed.count !== 1)
      throw new CertificateError("Сертификат уже активирован");

    const accrued = await earnPoints(customer.id, awarded, opts.loyaltyDays, {
      type: "gift_certificate",
      id: cert.id,
    }, { tx, reason: `Активация сертификата ${code}` });

    // Без согласия на обработку ПД баллы не начисляются — а значит сертификат
    // сгорел бы впустую. Роняем транзакцию: код остаётся неактивированным,
    // клиент даёт согласие и активирует его заново.
    if (!accrued)
      throw new CertificateError(
        "Клиент не подтвердил согласие на обработку персональных данных — баллы начислить нельзя. Отправьте ему ссылку согласия и повторите активацию.",
      );
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
