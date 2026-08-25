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
  new: ["decanted"],
  decanted: ["packed"],
  packed: ["shipped"],
  shipped: [],
  closed: [],
  refunded: [],
  // Тупиковые: остались от прежней схемы либо ставятся автоматически.
  confirmed: ["decanted"],
  rejected: [],
  returned: [],
};

/**
 * Закрыть заказ вручную может только админ и только пока заказ жив.
 *
 * Нужно для случаев, которые не ложатся в цепочку: самовывоз состоялся,
 * покупатель забрал заказ лично, продавец разобрался по телефону. Возвращённый
 * или уже закрытый трогать нечего.
 */
export function canClose(from: OrderStatusValue): boolean {
  return !["closed", "refunded", "rejected", "returned"].includes(from);
}

export function canTransition(
  from: OrderStatusValue,
  to: OrderStatusValue,
): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Начислять ли кешбек при переходе.
 *
 * Никогда: и кешбек, и списание остатков переехали на момент оплаты. Магазин
 * работает по предоплате и не перезванивает покупателям — как только деньги
 * пришли, заказ принят, и держать баллы «до подтверждения» не за чем. SMS
 * покупателю называет начисленную сумму сразу, так что и начислена она должна
 * быть сразу.
 *
 * Функция оставлена, чтобы вызывающий код не гадал: ответ «нет» здесь
 * осмысленный, а не отсутствие правила.
 */
export function grantsCashback(_to: OrderStatusValue): boolean {
  return false;
}

/**
 * Списывать ли остатки при переходе.
 *
 * Тоже нет — остатки уходят при оплате. Иначе оплаченный, но ещё не отлитый
 * заказ не виден на складе, и тот же миллилитр можно продать второй раз в
 * кассе.
 */
export function consumesStock(_to: OrderStatusValue): boolean {
  return false;
}

/** Заказ забирают сами — посылки, а значит и отслеживания, не будет. */
export function isPickup(deliveryType: string): boolean {
  return deliveryType === "pickup";
}

/**
 * Нужны ли трек-номер и служба доставки для перехода.
 *
 * Только при отправке и только если есть посылка: при самовывозе отслеживать
 * нечего.
 */
export function requiresTracking(
  to: OrderStatusValue,
  deliveryType: string,
): boolean {
  return to === "shipped" && !isPickup(deliveryType);
}

/**
 * Пора ли звать покупателя за заказом.
 *
 * Для самовывоза «упакован» и означает «готов к выдаче»: отдельного статуса
 * заводить не нужно, а вот сказать человеку, что можно приходить, — нужно.
 * Раньше самовывоз не получал ни одной SMS после оплаты: покупателю обещали
 * отправку, которой не будет, и молчали до последнего.
 */
export function notifiesReady(to: OrderStatusValue, deliveryType: string): boolean {
  return to === "packed" && isPickup(deliveryType);
}

/**
 * Самовывоз меняет смысл двух последних шагов: заказ не отправляют, а выдают.
 * Продавец не должен нажимать «Отправлен» на том, что человек забрал руками.
 */
const PICKUP_LABEL: Partial<Record<OrderStatusValue, string>> = {
  packed: "Готов к выдаче",
  shipped: "Выдан",
};

export function orderStatusLabel(
  status: OrderStatusValue,
  deliveryType: string,
): string {
  if (isPickup(deliveryType) && PICKUP_LABEL[status]) return PICKUP_LABEL[status]!;
  return ORDER_STATUS_LABEL[status];
}

export function orderStatusPublicLabel(
  status: OrderStatusValue,
  deliveryType: string,
): string {
  if (isPickup(deliveryType) && PICKUP_LABEL[status]) return PICKUP_LABEL[status]!;
  return ORDER_STATUS_PUBLIC_LABEL[status];
}

// ── Тексты SMS ──────────────────────────────────────────────────────────────
// Живут рядом с правилами, а не в местах отправки: текст зависит от способа
// получения, и держать эту развилку под тестами дешевле, чем узнавать о ней
// от покупателя.

/** Баллы без лишних нулей: 12 вместо 12.00, но 12.5 — как есть. */
function points(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * SMS сразу после оплаты.
 *
 * Про отправку говорим только тем, кому действительно отправляют: обещание
 * «отправим в течение 2 рабочих дней» человеку, который придёт в магазин
 * сам, — не мелкая неточность, а прямая дезинформация.
 */
export function paidSmsText(deliveryType: string, earned: number): string {
  const head = isPickup(deliveryType)
    ? "Здравствуйте! Спасибо за покупку. Ваш заказ будет укомплектован в ближайшее время — мы сообщим, когда его можно забрать."
    : "Здравствуйте! Спасибо за покупку. Ваш заказ будет укомплектован и отправлен в течение 2 рабочих дней.";
  return head + (earned > 0 ? ` За покупку вам начислено ${points(earned)} баллов.` : "");
}

/** SMS покупателю, когда заказ на самовывоз готов. */
export function readySmsText(address: string): string {
  return `Здравствуйте! Ваш заказ готов к выдаче. Ждём вас: ${address}`;
}

/** Текст SMS покупателю об отправке. */
export function shippedSmsText(
  service: DeliveryServiceValue,
  tracking: string,
): string {
  return `Здравствуйте, ваш заказ уже отправлен! Способ доставки - ${DELIVERY_SERVICE_LABEL[service]}. Трек номер для отслеживания - ${tracking}`;
}

/**
 * SMS об исправлении данных отправки.
 *
 * Отдельный текст, а не повтор прежнего: у покупателя на руках уже лежит
 * сообщение с другой службой или другим номером, и второе «ваш заказ уже
 * отправлен!» он прочтёт как второй заказ. Именно так и вышло однажды —
 * продавец поправил службу в карточке, а человек остался с неверной SMS.
 */
export function shippedFixSmsText(
  service: DeliveryServiceValue,
  tracking: string,
): string {
  return `Уточнение по вашему заказу: способ доставки - ${DELIVERY_SERVICE_LABEL[service]}, трек номер - ${tracking}. Извините за неточность в предыдущем сообщении.`;
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
  // Оплата — единственный момент, когда начисляется кешбек и списываются
  // остатки. Возврат оплаченного заказа откатывает и то и другое, на каком бы
  // шаге он ни находился. Неоплаченный (`rejected`) откатывать нечего: там
  // ничего и не происходило.
  const paid = status !== "rejected";

  return {
    // Списанные при заказе баллы возвращаем всегда: заказ не состоялся.
    refundSpentPoints: true,
    revokeCashback: paid,
    restoreStock: paid,
  };
}
