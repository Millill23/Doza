/**
 * Правила жизненного цикла онлайн-заказа.
 * Чистая логика без БД — переходы легко перепутать, поэтому под тестами.
 */

export type OrderStatusValue =
  | "new"
  | "confirmed"
  | "decanted"
  | "packed"
  | "shipped"
  | "refunded"
  | "closed"
  | "rejected"
  | "returned";

export type DeliveryServiceValue = "europochta" | "belpochta";

export const DELIVERY_SERVICE_LABEL: Record<DeliveryServiceValue, string> = {
  europochta: "Европочта",
  belpochta: "Белпочта",
};

export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  decanted: "Распит",
  packed: "Упакован",
  shipped: "Отправлен",
  refunded: "Возврат",
  // Остались от схемы с оплатой при получении — новым заказам не назначаются.
  closed: "Закрыт",
  rejected: "Не подтверждён",
  returned: "Возврат товара",
};

/**
 * Подписи для покупателя в личном кабинете.
 *
 * «Распит» — наше внутреннее слово: покупателю оно ничего не объясняет и звучит
 * тревожно рядом с его заказом. Снаружи говорим на обычном языке.
 */
export const ORDER_STATUS_PUBLIC_LABEL: Record<OrderStatusValue, string> = {
  new: "Оформлен",
  confirmed: "Подтверждён",
  decanted: "Собираем",
  packed: "Упакован",
  shipped: "Отправлен",
  refunded: "Деньги возвращены",
  closed: "Выполнен",
  rejected: "Отменён",
  returned: "Возврат",
};

/**
 * Куда можно перевести заказ вручную.
 *
 * Возврат сюда не входит: это отдельное действие админа, доступное с любого
 * шага, а не очередная ступень цепочки.
 */
export const ORDER_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  new: ["confirmed"],
  confirmed: ["decanted"],
  decanted: ["packed"],
  packed: ["shipped"],
  shipped: [],
  refunded: [],
  closed: [],
  rejected: [],
  returned: [],
};

export function canTransition(
  from: OrderStatusValue,
  to: OrderStatusValue,
): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Начислять ли кешбек при переходе.
 *
 * На подтверждении: заказ принят в работу, деньги уже списаны, и покупателю
 * можно обещать баллы.
 */
export function grantsCashback(to: OrderStatusValue): boolean {
  return to === "confirmed";
}

/**
 * Списывать ли остатки при переходе.
 *
 * На распиве: именно тогда парфюм физически уходит из флакона. Раньше — рано
 * (заказ ещё могут отменить), позже — поздно (товар уже не на складе).
 */
export function consumesStock(to: OrderStatusValue): boolean {
  return to === "decanted";
}

/** Нужны ли трек-номер и служба доставки для перехода. */
export function requiresTracking(
  to: OrderStatusValue,
  deliveryType: "pickup" | "post",
): boolean {
  return to === "shipped" && deliveryType === "post";
}

/** Текст SMS покупателю об отправке. */
export function shippedSmsText(
  service: DeliveryServiceValue,
  tracking: string,
): string {
  return `Здравствуйте, ваш заказ уже отправлен! Способ доставки - ${DELIVERY_SERVICE_LABEL[service]}. Трек номер для отслеживания - ${tracking}`;
}

export interface RefundReversal {
  /** Вернуть покупателю списанные баллы. */
  refundSpentPoints: boolean;
  /** Отобрать начисленный кешбек. */
  revokeCashback: boolean;
  /** Вернуть парфюм на склад. */
  restoreStock: boolean;
}

/**
 * Что откатывать при возврате денег.
 *
 * Зависит от того, до какого шага дошёл заказ: кешбек начисляется на
 * подтверждении, остатки списываются на распиве. Откатывать то, чего не было,
 * нельзя — иначе возврат подарит клиенту баллы или создаст парфюм из воздуха.
 */
export function refundReversal(status: OrderStatusValue): RefundReversal {
  const reached = (s: OrderStatusValue) =>
    ["confirmed", "decanted", "packed", "shipped"].indexOf(status) >=
    ["confirmed", "decanted", "packed", "shipped"].indexOf(s);

  return {
    // Списанные при заказе баллы возвращаем всегда: заказ не состоялся.
    refundSpentPoints: true,
    revokeCashback: status !== "new" && reached("confirmed"),
    restoreStock: status !== "new" && reached("decanted"),
  };
}
