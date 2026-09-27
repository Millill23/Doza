import { isSoldOut, OUT_OF_STOCK_ML, LOW_STOCK_ML } from "@doza/db/stock-rules";

/**
 * Как товар выглядит в ответе апишки.
 *
 * Отдельно от того, что лежит в базе: Decimal из Prisma в JSON превращается в
 * строку, а разбирать «"60.00"» на той стороне – лишняя работа и источник
 * ошибок. Приводим к числам один раз здесь.
 */

type PrismaProduct = {
  id: number;
  name: string;
  slug: string;
  gender: string;
  notesTop: string | null;
  notesMid: string | null;
  notesBase: string | null;
  description: string | null;
  isArchived: boolean;
  lowStockThreshold: number | null;
  loyaltyPercentOverride: unknown;
  brand: { id: number; name: string };
  photos?: { id: number; url: string; sortOrder: number }[];
  volumes?: { id: number; volumeMl: number; priceByn: unknown; isActive: boolean }[];
  inventory?: { quantityMl: number } | null;
  similarTo?: { similarId: number }[];
};

export function productShape(p: PrismaProduct) {
  const quantityMl = p.inventory?.quantityMl ?? 0;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    url: `https://doza-parfum.by/product/${p.slug}`,
    brand: { id: p.brand.id, name: p.brand.name },
    gender: p.gender,
    notes: { top: p.notesTop, mid: p.notesMid, base: p.notesBase },
    description: p.description,
    isArchived: p.isArchived,
    lowStockThreshold: p.lowStockThreshold,
    loyaltyPercentOverride:
      p.loyaltyPercentOverride == null ? null : Number(p.loyaltyPercentOverride),
    stock: {
      quantityMl,
      // Те же пороги, что на витрине: чтобы не пришлось помнить числа наизусть.
      soldOut: isSoldOut(quantityMl),
      low: quantityMl < LOW_STOCK_ML,
      soldOutBelowMl: OUT_OF_STOCK_ML,
    },
    volumes: (p.volumes ?? []).map((v) => ({
      id: v.id,
      volumeMl: v.volumeMl,
      priceByn: Number(v.priceByn),
      isActive: v.isActive,
    })),
    photos: (p.photos ?? []).map((ph) => ({
      id: ph.id,
      url: ph.url,
      sortOrder: ph.sortOrder,
    })),
    similarIds: (p.similarTo ?? []).map((s) => s.similarId),
  };
}

/** Что грузить из базы, чтобы собрать полную карточку. */
export const productInclude = {
  brand: { select: { id: true, name: true } },
  photos: { orderBy: { sortOrder: "asc" as const } },
  volumes: { orderBy: { volumeMl: "asc" as const } },
  inventory: { select: { quantityMl: true } },
  similarTo: { select: { similarId: true } },
};
