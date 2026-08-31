/**
 * Сертификаты в корзине.
 *
 * Хранятся отдельным ключом от товаров: у сертификата нет ни объёма, ни цены
 * из каталога, ни остатка на складе, и подмешивать его в тот же массив значит
 * ломать всё, что с корзиной уже работает — витрину, допродажу, выбор объёма.
 *
 * Для покупателя корзина при этом одна: заказ, оплата и посылка общие.
 */

export interface GiftCartItem {
  denomination: number;
  /** Отправить электронную версию ссылкой в SMS вместо бумажной карточки. */
  sendBySms: boolean;
  /** Локальные девять цифр — префикс добавляется при отправке. */
  recipientPhone?: string;
  recipientName?: string;
  message?: string;
}

const KEY = "doza_gift";

export function readGiftCart(): GiftCartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function writeGiftCart(items: GiftCartItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  // Тем же событием, что и товарная корзина, — чтобы счётчик в шапке и другие
  // вкладки узнали об изменении.
  window.dispatchEvent(new CustomEvent("doza:cart-updated"));
}

export function addGift(item: GiftCartItem): void {
  writeGiftCart([...readGiftCart(), item]);
}

export function removeGift(index: number): void {
  const list = readGiftCart();
  list.splice(index, 1);
  writeGiftCart(list);
}

export function clearGiftCart(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("doza:cart-updated"));
}
