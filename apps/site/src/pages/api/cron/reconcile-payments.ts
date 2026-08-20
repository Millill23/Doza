import type { APIRoute } from "astro";
import { pendingPaymentTokens } from "@doza/db/payments";
import { verifyAndApply } from "../../../lib/payment-verify";

export const prerender = false;

/**
 * Сверка зависших платежей со шлюзом.
 *
 * Подстраховка на случай, когда заказ оплачен, а мы об этом не узнали.
 * Покупатель вправе закрыть вкладку сразу после оплаты, не нажав «Продолжить»,
 * — тогда возврата на сайт не происходит. Остаётся вебхук, но и он может не
 * дойти: перезапуск контейнера во время деплоя, сбой сети, исчерпанные попытки
 * доставки. Деньги при этом списаны, и заказ обязан дойти до продавца.
 *
 * Задача берёт все неоплаченные заказы с попыткой платежа и спрашивает у
 * bePaid настоящий статус. Просроченные токены шлюз отдаёт как expired, и
 * заказ закрывается с возвратом баллов — отдельной логики для этого не нужно.
 *
 * Идемпотентна: `verifyAndApply` ничего не делает с уже оплаченным заказом.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const tokens = await pendingPaymentTokens();
  let paid = 0;
  let closed = 0;
  let stillPending = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      const r = await verifyAndApply(token);
      if (!r) continue;
      if (r.justPaid) paid++;
      else if (r.paymentStatus === "pending") stillPending++;
      else if (r.paymentStatus === "paid") stillPending++; // уже был оплачен
      else closed++;
    } catch (e) {
      // Шлюз недоступен — попробуем в следующий раз, заказ остаётся ждать.
      console.error("[reconcile] не удалось сверить платёж:", e);
      failed++;
    }
  }

  return json({ ok: true, checked: tokens.length, paid, closed, stillPending, failed });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
