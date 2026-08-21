import { prisma } from "@doza/db";
import {
  UPSELL_PERCENT,
  UPSELL_VOLUMES,
  UPSELL_LIMIT,
  baseProductIds,
  pickOffers,
  type CartLine,
} from "@doza/db/upsell-rules";

/**
 * Предложение добрать аромат к заказу — шаг между корзиной и оплатой.
 *
 * Строится вокруг того, что покупатель уже выбрал: берём похожие к его
 * позициям из `product_similar` (той же таблицы, что показывается на карточке
 * товара) и предлагаем со скидкой.
 *
 * Тот же список служит и пропуском к скидке при оформлении: сервер заново
 * считает, что он предлагал, и снижает цену только этим товарам. Пометка
 * «взято из допродажи» приходит из браузера и сама по себе ничего не значит.
 */

export interface UpsellOption {
  volumeMl: number;
  /** Обычная цена. */
  priceByn: number;
  /** Цена со скидкой допродажи. */
  discountedByn: number;
}

export interface UpsellItem {
  productId: number;
  slug: string;
  name: string;
  brand: string;
  image: string;
  gender: string;
  notes: string;
  options: UpsellOption[];
}

/**
 * Всё, что вообще можно предложить к этой корзине — без ограничения списка.
 *
 * Это проверка права на скидку, и она намеренно шире того, что показано на
 * странице. Иначе выходит ловушка: покупатель добавляет предложенный аромат,
 * тот оказывается в корзине, из витрины его убирают как уже купленный — и
 * вместе с ним исчезает основание для скидки, которую ему только что обещали.
 */
export async function offerableProductIds(lines: CartLine[]): Promise<number[]> {
  const base = baseProductIds(lines);
  if (base.length === 0) return [];

  const links = await prisma.productSimilar.findMany({
    where: { productId: { in: base } },
    select: { similarId: true },
  });
  return [...new Set(links.map((l) => l.similarId))];
}

/**
 * Что показать покупателю.
 *
 * Скрываем только то, что он выбрал сам: предлагать второй раз аромат, который
 * человек уже положил в корзину, — плохое начало разговора. А вот добранное
 * отсюда остаётся на виду: карточка с ним показывает счётчик, и убрать лишнее
 * можно там же, где добавил. Иначе после обновления страницы товар пропадал бы
 * из сетки вместе с единственным способом от него отказаться.
 */
export async function offerProductIds(lines: CartLine[]): Promise<number[]> {
  const ids = await offerableProductIds(lines);
  return pickOffers(
    ids.map((productId) => ({ productId })),
    baseProductIds(lines),
    UPSELL_LIMIT,
  );
}

/** Полное предложение с ценами — для страницы перед оплатой. */
export async function buildUpsell(lines: CartLine[]): Promise<UpsellItem[]> {
  const ids = await offerProductIds(lines);
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isArchived: false },
    include: {
      brand: { select: { name: true } },
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      volumes: {
        where: { isActive: true, volumeMl: { in: [...UPSELL_VOLUMES] } },
        orderBy: { volumeMl: "asc" },
      },
    },
  });

  // Порядок задаёт подбор, а не база: самые близкие должны идти первыми.
  const order = new Map(ids.map((id, i) => [id, i]));

  return products
    .filter((p) => p.volumes.length > 0)
    .sort((a, b) => order.get(a.id) - order.get(b.id))
    .map((p) => ({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand.name,
      image: p.photos[0]?.url ?? "/img/products/placeholder.webp",
      gender: p.gender,
      notes: [p.notesTop, p.notesMid, p.notesBase].filter(Boolean).join(" · "),
      options: p.volumes.map((v) => {
        const price = Number(v.priceByn);
        return {
          volumeMl: v.volumeMl,
          priceByn: price,
          discountedByn:
            Math.round(price * (1 - UPSELL_PERCENT / 100) * 100) / 100,
        };
      }),
    }));
}
