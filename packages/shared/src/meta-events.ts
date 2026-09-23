import { createHash } from "node:crypto";

/**
 * События для Meta: пиксель в браузере и Conversions API на сервере.
 *
 * Здесь только сборка полезной нагрузки и хеширование – без сети, чтобы всё
 * это можно было проверить тестами. Саму отправку делает вызывающий код.
 *
 * Зачем серверная отправка, когда есть пиксель в браузере: покупка
 * подтверждается ответом платёжного шлюза, а не возвратом покупателя на сайт.
 * Человек закрывает вкладку, теряет сеть, включает блокировщик – и покупки для
 * Meta не существует. Алгоритм учится на неполных данных и откручивает бюджет
 * мимо тех, кто на самом деле покупает.
 *
 * Оба события несут один `event_id`, и Meta склеивает их в одно. Без этого
 * покупка считалась бы дважды.
 */

/** Версия Graph API. Меняется редко, но пусть будет в одном месте. */
export const META_API_VERSION = "v21.0";

/** Валюта магазина. */
const CURRENCY = "BYN";

/**
 * Ключ склейки браузерного и серверного события.
 *
 * Номер заказа подходит идеально: он один на обе отправки и не повторяется.
 */
export function orderEventId(orderId: number): string {
  return `order-${orderId}`;
}

/** SHA-256 в нижнем регистре – Meta принимает персональные данные только так. */
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Привести значение к виду, который ждёт Meta, и захешировать.
 *
 * Пустые значения возвращают `undefined`: хеш от пустой строки – валидный
 * хеш, и Meta считала бы его настоящим (и не совпадающим ни с кем) признаком,
 * портя качество сопоставления.
 */
function hashed(value: string | null | undefined): string | undefined {
  const clean = (value ?? "").trim().toLowerCase();
  return clean ? sha256(clean) : undefined;
}

/** Телефон для Meta: только цифры с кодом страны, без плюса и скобок. */
export function normalizePhoneForMeta(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export interface MetaUserInput {
  /** Телефон покупателя в любом виде – нормализуем сами. */
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

/** Хешированные данные покупателя. Пустые поля не попадают в запрос вовсе. */
export function hashUserData(input: MetaUserInput): Record<string, string> {
  const out: Record<string, string> = {};
  const phone = normalizePhoneForMeta(input.phone);
  if (phone) out.ph = sha256(phone);

  const fn = hashed(input.firstName);
  if (fn) out.fn = fn;
  const ln = hashed(input.lastName);
  if (ln) out.ln = ln;
  const ct = hashed(input.city);
  if (ct) out.ct = ct;

  // Индекс Meta ждёт без пробелов; регистр для цифр роли не играет, но
  // приводим по общему правилу.
  const zp = hashed((input.postalCode ?? "").replace(/\s/g, ""));
  if (zp) out.zp = zp;

  // Страна у магазина одна – Беларусь. Код по ISO, в нижнем регистре.
  out.country = sha256("by");
  return out;
}

export interface PurchaseLine {
  /** Идентификатор товара – тот же, что в каталоге товаров Meta. */
  id: string;
  quantity: number;
  itemPrice: number;
}

export interface PurchaseInput {
  orderId: number;
  /** Сколько покупатель заплатил на самом деле: товары плюс доставка, минус баллы. */
  value: number;
  lines: PurchaseLine[];
  user: MetaUserInput;
  /** Адрес страницы, с которой пришла покупка. */
  sourceUrl: string;
  /** Момент оплаты. По умолчанию – сейчас. */
  at?: Date;
}

/** Одно событие Purchase в формате Conversions API. */
export function buildPurchaseEvent(input: PurchaseInput): Record<string, unknown> {
  return {
    event_name: "Purchase",
    event_time: Math.floor((input.at ?? new Date()).getTime() / 1000),
    event_id: orderEventId(input.orderId),
    // Покупка совершена на сайте, даже если подтвердил её шлюз: для Meta
    // важно, где было действие покупателя, а не кто прислал событие.
    action_source: "website",
    event_source_url: input.sourceUrl,
    user_data: hashUserData(input.user),
    custom_data: {
      currency: CURRENCY,
      // Meta отбрасывает события с нулевой или отрицательной суммой – заказ,
      // целиком закрытый баллами, отправляем с нулём осознанно: сам факт
      // покупки важнее суммы.
      value: Math.max(0, Math.round(input.value * 100) / 100),
      content_type: "product",
      contents: input.lines.map((l) => ({
        id: l.id,
        quantity: Math.max(1, Math.round(l.quantity)),
        item_price: Math.round(l.itemPrice * 100) / 100,
      })),
      order_id: String(input.orderId),
    },
  };
}

/** Адрес, на который отправляются серверные события. */
export function capiUrl(pixelId: string): string {
  return `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`;
}
