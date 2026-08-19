import type { APIRoute } from "astro";
import { verifyAndApply } from "../../../lib/payment-verify";

export const prerender = false;

/**
 * Уведомление bePaid об изменении статуса платежа.
 *
 * Из тела берём только токен — всему остальному здесь верить нельзя:
 * уведомления не подписаны, и прислать «оплачено» может кто угодно, кто знает
 * адрес. Настоящий статус спрашиваем у шлюза сами.
 *
 * Отвечаем 200 и на неизвестный токен: bePaid повторяет доставку до 25 раз в
 * течение нескольких суток, и городить очередь повторов из-за чужого запроса
 * незачем.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const token =
    (body as { token?: string; transaction?: { tracking_id?: string } } | null)?.token ??
    null;

  if (!token) {
    console.warn("[payments] уведомление без токена");
    return new Response("ok", { status: 200 });
  }

  try {
    const result = await verifyAndApply(token);
    if (!result) console.warn("[payments] неизвестный токен платежа:", token);
  } catch (e) {
    // Шлюз недоступен — просим повторить: заказ останется неоплаченным, но
    // деньги покупателя уже могли уйти, поэтому терять уведомление нельзя.
    console.error("[payments] ошибка обработки уведомления:", e);
    return new Response("retry", { status: 500 });
  }

  return new Response("ok", { status: 200 });
};
