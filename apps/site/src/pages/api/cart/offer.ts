import type { APIRoute } from "astro";
import { buildUpsell } from "../../../lib/upsell";
import { UPSELL_PERCENT } from "@doza/db/upsell-rules";

export const prerender = false;

/**
 * Что предложить добрать к этой корзине.
 *
 * Тот же расчёт, что подтверждает право на скидку при оформлении: страница
 * показывает ровно то, за что сервер потом действительно снизит цену.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  try {
    const offers = await buildUpsell(items);
    return json({ ok: true, percent: UPSELL_PERCENT, offers });
  } catch (e) {
    // Допродажа — необязательный шаг: если она не собралась, покупатель
    // должен спокойно дойти до оплаты, а не упереться в ошибку.
    console.error("[upsell] не удалось собрать предложение:", e);
    return json({ ok: true, percent: UPSELL_PERCENT, offers: [] });
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
