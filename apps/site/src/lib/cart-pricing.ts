import { prisma } from "@doza/db";
import { priceCart, type DiscountKind } from "@doza/db/pricing";
import { pickActivePromo, getGlobalPromo, mergePromos } from "@doza/db/promos";
import { upsellPercentFor } from "@doza/db/upsell-rules";
import { offerableProductIds } from "./upsell";

/**
 * Расчёт корзины на сайте.
 *
 * Один код и для предпросмотра в корзине, и для оформления заказа: если считать
 * их порознь, покупатель увидит одну сумму, а спишется другая — и разберётся
 * в этом уже банк.
 *
 * Цены берутся из базы, а не из корзины браузера: в localStorage они лежат с
 * того момента, когда товар положили, и с тех пор акция могла кончиться.
 */

export interface QuoteItem {
  productId: number;
  volumeMl: number;
  qty: number;
  /** Позиция взята из допродажи. Слово браузера — сервер это перепроверит. */
  fromUpsell?: boolean;
}

export interface QuotedLine {
  productId: number;
  volumeMl: number;
  qty: number;
  /** Цена единицы после скидок — она и уходит в позицию заказа. */
  priceByn: number;
  label: string;
}

export interface CartQuote {
  lines: QuotedLine[];
  /** Сумма без скидок. */
  gross: number;
  /** Сумма к оплате. */
  net: number;
  discount: number;
  kind: DiscountKind;
}

/** Ошибка расчёта, которую можно показать покупателю. */
export class CartError extends Error {}

async function setting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Скидка по VIP-карте для клиента.
 *
 * Принимает id из сессии, а не телефон из формы. Телефон в поле ввода — это
 * просто набранные цифры: назвав чужой номер, можно было бы получить чужую
 * скидку. Карта привязана к аккаунту, поэтому и скидка даётся тому, кто в этот
 * аккаунт вошёл.
 */
export async function vipPercentFor(customerId: number | null): Promise<number> {
  if (customerId === null) return 0;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { vipCardNumber: true },
  });
  if (!customer?.vipCardNumber) return 0;
  return setting("vip_discount_percent", 20);
}

/**
 * Посчитать корзину.
 *
 * Скидки не складываются — движок `priceCart` тот же, что и в кассе, и выбирает
 * вариант, выгодный покупателю: VIP либо акция, но не обе сразу.
 */
export async function quoteCart(
  items: QuoteItem[],
  opts: { vipPercent?: number } = {},
): Promise<CartQuote> {
  if (items.length === 0) throw new CartError("Корзина пуста");

  const volumes = await prisma.productVolume.findMany({
    where: {
      isActive: true,
      OR: items.map((i) => ({ productId: i.productId, volumeMl: i.volumeMl })),
    },
    include: {
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          promos: {
            select: {
              discountPercent: true,
              cashbackPercent: true,
              startsAt: true,
              endsAt: true,
            },
          },
        },
      },
    },
  });

  const byKey = new Map(volumes.map((v) => [`${v.productId}:${v.volumeMl}`, v]));

  // Акция «на все товары» не привязана к товару — достаём отдельно.
  const globalPromo = await getGlobalPromo();

  // Что мы вправе продать со скидкой допродажи. Считаем сами, по своей
  // таблице похожих: пометка в корзине — заявка, а не разрешение.
  const offered = new Set(
    items.some((i) => i.fromUpsell) ? await offerableProductIds(items) : [],
  );

  const productPromoPercent: Record<number, number> = {};
  const lines: {
    productId: number;
    qty: number;
    unitPrice: number;
    upsellPercent?: number;
  }[] = [];
  const meta: { volumeMl: number; label: string }[] = [];

  for (const item of items) {
    const rec = byKey.get(`${item.productId}:${item.volumeMl}`);
    if (!rec) throw new CartError(`Позиция недоступна (товар ${item.productId})`);

    const qty = Math.max(1, Math.floor(item.qty || 1));
    const promo = pickActivePromo(
      rec.product.promos.map((pr) => ({
        discountPercent: pr.discountPercent != null ? Number(pr.discountPercent) : null,
        cashbackPercent: pr.cashbackPercent != null ? Number(pr.cashbackPercent) : null,
        startsAt: pr.startsAt,
        endsAt: pr.endsAt,
      })),
    );
    productPromoPercent[item.productId] = Math.max(
      productPromoPercent[item.productId] ?? 0,
      promo.discountPercent,
    );

    lines.push({
      productId: item.productId,
      qty,
      unitPrice: Number(rec.priceByn),
      upsellPercent: upsellPercentFor(item, offered),
    });
    meta.push({
      volumeMl: item.volumeMl,
      label: `${rec.product.brand.name} ${rec.product.name}, ${item.volumeMl} мл ×${qty}`,
    });
  }

  const priced = priceCart({
    lines,
    vipPercent: opts.vipPercent ?? 0,
    productPromoPercent,
    allProductsPromoPercent: globalPromo.discountPercent,
  });

  return {
    lines: lines.map((l, i) => ({
      productId: l.productId,
      volumeMl: meta[i].volumeMl,
      qty: l.qty,
      // Цена единицы — из итога по позиции: так сумма позиций всегда сходится
      // с тем, что покупатель видел в корзине.
      priceByn: Math.round((priced.lineNet[i] / l.qty) * 100) / 100,
      label: meta[i].label,
    })),
    gross: priced.gross,
    net: priced.net,
    discount: priced.discount,
    kind: priced.kind,
  };
}
