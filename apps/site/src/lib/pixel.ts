/**
 * Браузерные события Meta Pixel.
 *
 * Тонкая обёртка вокруг глобального `fbq`. Нужна, чтобы вызывающий код не
 * проверял каждый раз, загрузился ли пиксель: его может не быть вовсе –
 * переменная не задана при разработке, сработал блокировщик, не дошёл скрипт.
 * Реклама – не повод ронять корзину.
 */

type Fbq = (
  action: string,
  event: string,
  params?: Record<string, unknown>,
  options?: { eventID?: string },
) => void;

/** Отправить событие, если пиксель на странице есть. */
export function trackPixel(
  event: string,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  try {
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    if (typeof fbq !== "function") return;
    // eventID – ключ склейки с серверным событием. Без него одна покупка
    // посчиталась бы дважды.
    fbq("track", event, params, eventId ? { eventID: eventId } : undefined);
  } catch {
    /* статистика не должна мешать покупке */
  }
}

/**
 * Параметры товара для событий ViewContent и AddToCart.
 *
 * Живёт здесь, а не рядом со сборкой серверных событий: туда тянется
 * `node:crypto` для хеширования, и импорт из клиентского компонента утащил бы
 * его в браузерный бандл.
 */
export function contentParams(opts: {
  id: number | string;
  name: string;
  value: number;
  quantity?: number;
}): Record<string, unknown> {
  return {
    content_ids: [String(opts.id)],
    content_name: opts.name,
    content_type: "product",
    currency: "BYN",
    value: Math.round(opts.value * 100) / 100,
    ...(opts.quantity
      ? { contents: [{ id: String(opts.id), quantity: opts.quantity }] }
      : {}),
  };
}
