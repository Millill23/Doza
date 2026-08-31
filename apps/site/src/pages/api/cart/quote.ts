import type { APIRoute } from "astro";
import { getBalance } from "@doza/db/loyalty";
import { prisma } from "@doza/db";
import { currentCustomerId } from "../../../lib/customer-auth";
import { quoteCart, vipPercentFor, CartError } from "../../../lib/cart-pricing";
import { offerProductIds } from "../../../lib/upsell";
import { findUsablePromoCode } from "@doza/db/promo-codes";
import {
  DELIVERY_CHOICES,
  deliveryCost,
  freeDeliveryHint,
  type DeliveryTypeValue,
} from "@doza/db/delivery-rules";

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
  const deliveryType: DeliveryTypeValue = DELIVERY_CHOICES.includes(body.deliveryType)
    ? body.deliveryType
    : "pickup";

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

  // Промокод проверяем и здесь, чтобы покупатель увидел скидку сразу, а не
  // узнал о неверном коде уже на кнопке оплаты.
  const promoLookup = await findUsablePromoCode(String(body.promoCode ?? ""));
  const promo = promoLookup?.ok ? promoLookup.promo : null;
  const promoError = promoLookup && !promoLookup.ok ? promoLookup.error : null;

  try {
    const cart = await quoteCart(items, {
      vipPercent,
      promoCodePercent: promo?.discountPercent ?? 0,
    });
    // Корзине важно лишь, есть ли предложение: от этого зависит, ведёт кнопка
    // на шаг допродажи или сразу к оплате. Пустой страницы быть не должно.
    const upsellCount = (await offerProductIds(items)).length;
    // Доставку считает сервер по той же формуле, что и приём заказа: иначе
    // корзина покажет одну сумму, а платёжная страница выставит другую.
    const delivery = deliveryCost({ type: deliveryType, goodsTotal: cart.net });
    return json({
      ok: true,
      session,
      cart,
      upsellCount,
      delivery: { ...delivery, hint: freeDeliveryHint(delivery) },
      promo: promo ? { code: promo.code, percent: promo.discountPercent } : null,
      promoError,
    });
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
