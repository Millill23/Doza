/**
 * Данные оформления между корзиной и страницей допродажи.
 *
 * Покупатель заполняет форму в корзине, а платит уже со следующего шага —
 * значит форму нужно донести. Держим её в sessionStorage: заполненный адрес не
 * должен пропадать от случайного «назад» или обновления страницы, но и
 * оставаться в браузере после закрытия вкладки ему незачем.
 */

const KEY = "doza_checkout";

export interface CheckoutForm {
  name: string;
  /** Локальные девять цифр, без префикса. */
  phone: string;
  deliveryType: "pickup" | "post";
  delivery: {
    lastName: string;
    firstName: string;
    middleName: string;
    postalCode: string;
    region: string;
    city: string;
    address: string;
  };
  comment: string;
  loyaltySpend: number;
}

export function saveCheckout(form: CheckoutForm): void {
  sessionStorage.setItem(KEY, JSON.stringify(form));
}

export function loadCheckout(): CheckoutForm | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutForm) : null;
  } catch {
    return null;
  }
}

export function clearCheckout(): void {
  sessionStorage.removeItem(KEY);
}

export interface CartItemLike {
  productId: number;
  volumeMl: number;
  qty: number;
  fromUpsell?: boolean;
}

export type PlaceOrderResult =
  | { ok: true; redirectUrl: string }
  | { ok: true; orderId: number }
  | { ok: false; error: string };

/**
 * Отправить заказ.
 *
 * Цены не передаём вовсе — сервер считает их сам. Здесь только состав корзины,
 * данные покупателя и пометка, какие позиции взяты из допродажи.
 */
export async function placeOrder(
  form: CheckoutForm,
  items: CartItemLike[],
): Promise<PlaceOrderResult> {
  try {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: "375" + form.phone,
        deliveryType: form.deliveryType,
        delivery: form.deliveryType === "post" ? form.delivery : undefined,
        comment: form.comment,
        loyaltySpend: form.loyaltySpend,
        items: items.map((i) => ({
          productId: i.productId,
          volumeMl: i.volumeMl,
          qty: i.qty,
          fromUpsell: i.fromUpsell === true,
        })),
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok)
      return { ok: false, error: data.error || "Не удалось оформить заказ" };
    return data.redirectUrl
      ? { ok: true, redirectUrl: data.redirectUrl }
      : { ok: true, orderId: data.orderId };
  } catch {
    return { ok: false, error: "Ошибка сети. Попробуйте ещё раз." };
  }
}
