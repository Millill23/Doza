import crypto from "node:crypto";
import { prisma } from "./index";
import { createSmsCode, findSmsCodeByToken } from "./sms-codes";
import {
  CONSENT_SMS,
  CONSENT_TTL_MS,
  consentLink,
  type ConsentSmsKind,
} from "./consent-rules";

/**
 * Согласие на обработку персональных данных для программы лояльности
 * (закон РБ №99-З «О защите персональных данных»).
 *
 * Разделение целей: приём и доставка заказа — это исполнение договора, согласия
 * не требует. А хранение клиента в базе лояльности (баллы, VIP, персональные
 * рассылки) — отдельная цель сверх разовой покупки, и вот она требует явного
 * согласия. Поэтому купить можно и без согласия — просто не будет баллов.
 *
 * Механика одна на все каналы: клиенту уходит SMS с персональной ссылкой, он
 * открывает её и нажимает «Согласен». Ст. 5 закона прямо допускает электронную
 * форму — активное осознанное действие, бумага не нужна.
 *
 * Сроки, тексты и проверка просрочки — в `consent-rules.ts`.
 */

export * from "./consent-rules";

const PURPOSE = "consent";

/** Базовый адрес сайта для ссылки (в проде задаётся в окружении). */
function siteUrl(): string {
  return process.env.SITE_URL || "https://doza-parfum.by";
}

export interface ConsentRequestResult {
  ok: boolean;
  /** Ушла ли SMS. Если нет — срок на ответ не запускается. */
  smsSent: boolean;
  /** Токен ссылки: нужен для отладки и локальной проверки без SMS. */
  token: string;
  error?: string;
}

/**
 * Выдать клиенту персональную ссылку и отправить её по SMS.
 *
 * `consentRequestedAt` проставляется только при успешной отправке: с этой даты
 * идёт отсчёт до удаления, и было бы нечестно удалять человека за молчание,
 * если сообщение до него не дошло из-за сбоя шлюза.
 *
 * `sendSms` передаётся аргументом, а не импортируется: `@doza/db` не зависит от
 * `@doza/shared`, и эта развязка позволяет подменять отправку в тестах.
 */
export async function requestConsent(
  customerId: number,
  sendSms: (phone: string, text: string) => Promise<{ ok: boolean; error?: string }>,
  kind: ConsentSmsKind = "invite",
): Promise<ConsentRequestResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true, consentStatus: true },
  });
  if (!customer) throw new Error("Клиент не найден");
  if (customer.consentStatus === "confirmed")
    return { ok: true, smsSent: false, token: "", error: "Согласие уже получено" };

  // Токен короткий, чтобы ссылка влезала в SMS: 96 бит случайности хватает —
  // подобрать одноразовую ссылку перебором невозможно.
  const token = crypto.randomBytes(12).toString("hex");
  await createSmsCode(customer.phone, PURPOSE, undefined, {
    code: token,
    ttlMs: CONSENT_TTL_MS,
  });

  const sms = await sendSms(
    customer.phone,
    CONSENT_SMS[kind](consentLink(siteUrl(), token)),
  );
  if (sms.ok) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { consentRequestedAt: new Date() },
    });
  }

  return { ok: true, smsSent: sms.ok, token, error: sms.error };
}

export interface ConsentPageData {
  name: string;
  phone: string;
  /** Согласие уже подтверждено раньше — показываем это, а не форму. */
  alreadyConfirmed: boolean;
}

/** Данные для страницы согласия по токену из ссылки. null — ссылка негодная. */
export async function getConsentByToken(
  token: string,
): Promise<ConsentPageData | { expired: true } | null> {
  if (!token) return null;

  const rec = await findSmsCodeByToken(PURPOSE, token);
  if (rec && rec.expiresAt < new Date()) return { expired: true };

  // Токен мог быть уже погашен — значит согласие получено, и это не ошибка:
  // человек просто открыл ссылку повторно. Показываем ему «уже подтверждено».
  const used =
    rec ??
    (await prisma.smsCode.findFirst({
      where: { purpose: PURPOSE, code: token },
      orderBy: { createdAt: "desc" },
    }));
  if (!used) return null;

  const customer = await prisma.customer.findUnique({ where: { phone: used.phone } });
  if (!customer) return null;
  return {
    name: customer.name,
    phone: customer.phone,
    alreadyConfirmed: customer.consentStatus === "confirmed",
  };
}

export interface ConsentConfirmResult {
  ok: boolean;
  name?: string;
  error?: string;
}

/** Подтвердить согласие по токену из ссылки. */
export async function confirmConsent(token: string): Promise<ConsentConfirmResult> {
  const rec = await findSmsCodeByToken(PURPOSE, token);
  if (!rec) return { ok: false, error: "Ссылка недействительна или уже использована" };
  if (rec.expiresAt < new Date()) return { ok: false, error: "Срок действия ссылки истёк" };

  const customer = await prisma.customer.findUnique({ where: { phone: rec.phone } });
  if (!customer) return { ok: false, error: "Клиент не найден" };

  await prisma.$transaction([
    prisma.smsCode.update({ where: { id: rec.id }, data: { consumed: true } }),
    prisma.customer.update({
      where: { id: customer.id },
      data: {
        consentStatus: "confirmed",
        consentConfirmedAt: new Date(),
        // Переход по ссылке из SMS — это и подтверждение владения номером,
        // ровно то же, что давал одноразовый код.
        phoneVerified: true,
      },
    }),
  ]);

  return { ok: true, name: customer.name };
}
