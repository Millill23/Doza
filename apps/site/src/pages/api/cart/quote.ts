import type { APIRoute } from "astro";
import { getBalance } from "@doza/db/loyalty";
import { prisma } from "@doza/db";
import { currentCustomerId } from "../../../lib/customer-auth";
import { quoteCart, vipPercentFor, CartError } from "../../../lib/cart-pricing";
import { offerProductIds } from "../../../lib/upsell";

export const prerender = false;

/**
 * Что покупатель увидит в корзине: суммы, скидка и его аккаунт.
 *
 * Скидка считается здесь, а не в браузере: цены в localStorage лежат с момента,
 * когда товар положили в корзину, а VIP-карта вообще не то, о чём стоит
 * спрашивать клиентский код. Тот же расчёт применяется при оформлении, поэтому
 * показанная сумма и списанная всегда совпадают.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  const customerId = await currentCustomerId(cookies);
  const vipPercent = await vipPercentFor(customerId);

  const account = customerId
    ? await prisma.customer.findUnique({
        where: { id: customerId },
        select: { name: true, phone: true, vipCardNumber: true },
      })
    : null;

  const session = account
    ? {
        authenticated: true as const,
        name: account.name,
        phone: account.phone,
        vipCard: account.vipCardNumber,
        vipPercent,
        balance: await getBalance(customerId!),
      }
    : { authenticated: false as const, balance: 0, vipPercent: 0 };

  // Пустую корзину считать нечего, но данные аккаунта отдать всё равно нужно:
  // по ним корзина решает, показывать ли поля телефона и имени.
  if (items.length === 0) return json({ ok: true, session, cart: null });

  try {
    const cart = await quoteCart(items, { vipPercent });
    // Корзине важно лишь, есть ли предложение: от этого зависит, ведёт кнопка
    // на шаг допродажи или сразу к оплате. Пустой страницы быть не должно.
    const upsellCount = (await offerProductIds(items)).length;
    return json({ ok: true, session, cart, upsellCount });
  } catch (e) {
    if (e instanceof CartError)
      return json({ ok: false, error: e.message, session }, 400);
    console.error("[cart] не удалось посчитать корзину:", e);
    return json({ ok: false, error: "Не удалось рассчитать корзину", session }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
