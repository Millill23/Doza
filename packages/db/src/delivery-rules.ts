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

/** Экспресс-доставка EMS: срочная отправка Белпочтой. */
export const EXPRESS_FEE = 15;

/**
 * Можно ли заказать экспресс этим способом.
 *
 * EMS – услуга Белпочты. У Европочты своя сеть отделений и своя скорость, а
 * самовывоз срочным не бывает: посылки нет вовсе.
 */
export function canExpress(type: DeliveryTypeValue): boolean {
  return type === "belpochta";
}

export function isPostDelivery(type: DeliveryTypeValue): boolean {
  return type !== "pickup";
}

export interface DeliveryCost {
  /** Сколько добавить к заказу за доставку. */
  fee: number;
  /** Сколько не хватает до бесплатной доставки. 0 – уже бесплатно. */
  missingForFree: number;
  /** Доставка бесплатна: самовывоз или сумма перевалила порог. */
  free: boolean;
  /** Заказ едет экспрессом EMS. */
  express: boolean;
}

/**
 * Посчитать доставку.
 *
 * Порог считается по сумме товаров со скидками, но ДО списания баллов: баллы –
 * это способ оплаты, а не уменьшение заказа. Покупатель, закрывший баллами
 * половину заказа на 110 рублей, заказал всё равно на 110 и доставку заслужил.
 */
export function deliveryCost(opts: {
  type: DeliveryTypeValue;
  /** Сумма товаров после скидок, без баллов и без самой доставки. */
  goodsTotal: number;
  /** Покупатель выбрал экспресс EMS. */
  express?: boolean;
}): DeliveryCost {
  if (!isPostDelivery(opts.type)) {
    return { fee: 0, missingForFree: 0, free: true, express: false };
  }

  // Экспресс – отдельная услуга, а не надбавка к обычной доставке: платят
  // ровно её цену. Порог бесплатной сюда не достаёт – бесплатной срочной
  // отправки не бывает, и складывать пятнадцать рублей с десятью тоже нельзя.
  if (opts.express && canExpress(opts.type)) {
    return { fee: EXPRESS_FEE, missingForFree: 0, free: false, express: true };
  }

  const goods = Math.max(0, opts.goodsTotal);
  if (goods >= FREE_DELIVERY_FROM) {
    return { fee: 0, missingForFree: 0, free: true, express: false };
  }

  return {
    fee: DELIVERY_FEE,
    missingForFree: Math.round((FREE_DELIVERY_FROM - goods) * 100) / 100,
    free: false,
    express: false,
  };
}

/**
 * Подсказка «доберите до бесплатной доставки».
 *
 * Возвращает `null`, когда говорить нечего: при самовывозе доставки нет, а
 * при уже бесплатной – напоминание превратилось бы в уговор купить лишнего.
 */
export function freeDeliveryHint(cost: DeliveryCost): string | null {
  // Экспресс платный при любой сумме – уговаривать добрать до бесплатной
  // значит обещать то, чего не будет.
  if (cost.express) return null;
  if (cost.free || cost.missingForFree <= 0) return null;
  return `Закажите ещё на ${cost.missingForFree.toFixed(2)} BYN – и доставка будет бесплатной`;
}

/** Нужен ли адрес с индексом (Белпочта) или достаточно отделения (Европочта). */
export function needsPostalAddress(type: DeliveryTypeValue): boolean {
  return type === "belpochta" || type === "post";
}

/** Нужно ли выбрать отделение Европочты. */
export function needsOffice(type: DeliveryTypeValue): boolean {
  return type === "europost";
}
