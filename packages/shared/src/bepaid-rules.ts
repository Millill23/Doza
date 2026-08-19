/**
 * Правила работы с платежами bePaid: суммы и трактовка ответов шлюза.
 * Чистая логика без сети — здесь легко ошибиться на деньгах, поэтому тесты.
 */

/** Итог проверки платежа: во что превращается ответ шлюза. */
export type PaymentOutcome = "paid" | "failed" | "expired" | "pending";

/**
 * Сумма в минимальных единицах (копейках), как требует bePaid: 32.45 → 3245.
 *
 * Умножение с плавающей точкой округляем явно: `32.45 * 100` даёт
 * 3244.9999999999995, и без округления покупатель заплатил бы на копейку
 * меньше, а сверка сумм при подтверждении платежа разошлась бы.
 */
export function toMinorUnits(byn: number): number {
  if (!Number.isFinite(byn)) throw new Error("Некорректная сумма");
  return Math.round(byn * 100);
}

/** Обратный перевод: 3245 → 32.45. */
export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

export interface GatewayState {
  /** Статус из ответа шлюза. */
  status?: string | null;
  /** Транзакция обработана платёжной системой. */
  finished?: boolean | null;
  /** Срок оплаты истёк. */
  expired?: boolean | null;
}

/**
 * Во что превращается состояние токена.
 *
 * Порядок проверок важен. Пока `finished` не выставлен, транзакции просто
 * ещё не было: на такой токен bePaid отвечает `status: "error"` с сообщением
 * «Gateway response not found», и принимать это за отказ нельзя — иначе заказ
 * отменялся бы прямо в тот момент, когда покупатель вводит номер карты на
 * странице банка.
 *
 * Оплаченным считаем только явный `successful` у завершённой транзакции: всё
 * остальное — либо ещё не деньги, либо уже не деньги.
 */
export function paymentOutcome(state: GatewayState): PaymentOutcome {
  if (state.expired) return "expired";
  if (!state.finished) return "pending";

  const status = (state.status ?? "").toLowerCase();
  if (status === "successful") return "paid";
  if (status === "failed" || status === "error" || status === "declined")
    return "failed";
  return "pending";
}

/**
 * Можно ли засчитать платёж как оплату заказа.
 *
 * Проверяются три вещи разом, и каждая закрывает свой способ получить товар
 * бесплатно: подделанный статус, тестовая транзакция в проде и оплата суммы
 * меньше стоимости заказа.
 */
export function canAcceptPayment(opts: {
  outcome: PaymentOutcome;
  /** Транзакция помечена шлюзом как тестовая. */
  isTest: boolean;
  /** Разрешены ли тестовые транзакции в этом окружении. */
  allowTest: boolean;
  /** Сколько реально оплачено, в копейках. */
  paidMinor: number;
  /** Сколько ожидает заказ, в копейках. */
  expectedMinor: number;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.outcome !== "paid")
    return { ok: false, reason: `Платёж не подтверждён (${opts.outcome})` };

  if (opts.isTest && !opts.allowTest)
    return {
      ok: false,
      reason: "Тестовая транзакция в боевом режиме — заказ не оплачен",
    };

  // Недоплату не принимаем, переплату принимаем: вернуть разницу проще, чем
  // объяснять покупателю, почему оплаченный заказ не собран.
  if (opts.paidMinor < opts.expectedMinor)
    return {
      ok: false,
      reason: `Оплачено ${fromMinorUnits(opts.paidMinor)} BYN вместо ${fromMinorUnits(opts.expectedMinor)} BYN`,
    };

  return { ok: true };
}

/**
 * Номер заказа для ЕРИП: там требуется ровно 12 цифр.
 * Пока не используется — ЕРИП подключим отдельно, но формат фиксируем сразу,
 * чтобы номера в чеках и в дереве ЕРИП не разошлись задним числом.
 */
export function eripOrderId(orderId: number): string {
  return String(orderId).padStart(12, "0");
}
