/**
 * Стоимость доставки и порог бесплатной.
 *
 * Чистая логика без БД: одни и те же числа считает корзина в браузере, шаг
 * допродажи и приём заказа на сервере. Разъехавшись, они покажут покупателю
 * одну сумму, а спишут другую.
 */

export type DeliveryTypeValue = "pickup" | "belpochta" | "europost" | "post";

export const DELIVERY_TYPE_LABEL: Record<DeliveryTypeValue, string> = {
  pickup: "Самовывоз",
  belpochta: "Белпочта",
  europost: "Европочта",
  // Осталось от времён, когда почта была одна.
  post: "Доставка почтой",
};

/** Способы, которые покупатель выбирает при оформлении. */
export const DELIVERY_CHOICES: DeliveryTypeValue[] = [
  "pickup",
  "belpochta",
  "europost",
];

/** Стоимость доставки, BYN. */
export const DELIVERY_FEE = 10;

/** Сумма заказа, начиная с которой доставка бесплатна. */
export const FREE_DELIVERY_FROM = 100;

export function isPostDelivery(type: DeliveryTypeValue): boolean {
  return type !== "pickup";
}

export interface DeliveryCost {
  /** Сколько добавить к заказу за доставку. */
  fee: number;
  /** Сколько не хватает до бесплатной доставки. 0 — уже бесплатно. */
  missingForFree: number;
  /** Доставка бесплатна: самовывоз или сумма перевалила порог. */
  free: boolean;
}

/**
 * Посчитать доставку.
 *
 * Порог считается по сумме товаров со скидками, но ДО списания баллов: баллы —
 * это способ оплаты, а не уменьшение заказа. Покупатель, закрывший баллами
 * половину заказа на 110 рублей, заказал всё равно на 110 и доставку заслужил.
 */
export function deliveryCost(opts: {
  type: DeliveryTypeValue;
  /** Сумма товаров после скидок, без баллов и без самой доставки. */
  goodsTotal: number;
}): DeliveryCost {
  if (!isPostDelivery(opts.type)) {
    return { fee: 0, missingForFree: 0, free: true };
  }

  const goods = Math.max(0, opts.goodsTotal);
  if (goods >= FREE_DELIVERY_FROM) {
    return { fee: 0, missingForFree: 0, free: true };
  }

  return {
    fee: DELIVERY_FEE,
    missingForFree: Math.round((FREE_DELIVERY_FROM - goods) * 100) / 100,
    free: false,
  };
}

/**
 * Подсказка «доберите до бесплатной доставки».
 *
 * Возвращает `null`, когда говорить нечего: при самовывозе доставки нет, а
 * при уже бесплатной — напоминание превратилось бы в уговор купить лишнего.
 */
export function freeDeliveryHint(cost: DeliveryCost): string | null {
  if (cost.free || cost.missingForFree <= 0) return null;
  return `Закажите ещё на ${cost.missingForFree.toFixed(2)} BYN — и доставка будет бесплатной`;
}

/** Нужен ли адрес с индексом (Белпочта) или достаточно отделения (Европочта). */
export function needsPostalAddress(type: DeliveryTypeValue): boolean {
  return type === "belpochta" || type === "post";
}

/** Нужно ли выбрать отделение Европочты. */
export function needsOffice(type: DeliveryTypeValue): boolean {
  return type === "europost";
}
