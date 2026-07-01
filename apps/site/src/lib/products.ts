import { prisma } from "@doza/db";
import type { ProductCard, ProductDetail, Gender } from "./types";

/**
 * Слой данных каталога. Читает из PostgreSQL через Prisma (@doza/db).
 */

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1587017539504-67cfbddac569?q=80&w=900&auto=format&fit=crop";

type ProductWithRels = {
  id: number;
  slug: string;
  name: string;
  gender: Gender;
  notesTop: string | null;
  notesMid: string | null;
  notesBase: string | null;
  description: string | null;
  loyaltyPercentOverride: unknown | null;
  brand: { name: string };
  photos: { url: string }[];
  volumes: { volumeMl: number; priceByn: unknown; isActive: boolean }[];
};

/** Глобальный процент кешбэка из настроек (кэшируется на время запроса). */
async function getGlobalCashback(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "loyalty_percent" } });
  return s ? Number(s.value) : 5;
}

function toCard(p: ProductWithRels, globalPercent: number): ProductCard {
  const prices = p.volumes
    .filter((v) => v.isActive)
    .map((v) => Number(v.priceByn));
  const override =
    p.loyaltyPercentOverride != null ? Number(p.loyaltyPercentOverride) : null;
  const cashbackPercent = override ?? globalPercent;
  return {
    id: p.id,
    slug: p.slug,
    brand: p.brand.name,
    name: p.name,
    gender: p.gender,
    image: p.photos[0]?.url ?? FALLBACK_IMG,
    priceFrom: prices.length ? Math.min(...prices) : 0,
    cashbackPercent,
    cashbackBoosted: override != null && override > globalPercent,
  };
}

export interface ProductFilter {
  brands?: string[];
  gender?: Gender;
  query?: string;
}

const cardInclude = {
  brand: { select: { name: true } },
  photos: { orderBy: { sortOrder: "asc" as const }, take: 1 },
  volumes: { where: { isActive: true } },
};

export async function getProducts(
  filter: ProductFilter = {},
): Promise<ProductCard[]> {
  const where: Record<string, unknown> = { isArchived: false };
  if (filter.gender) where.gender = filter.gender;
  if (filter.brands?.length) where.brand = { name: { in: filter.brands } };
  if (filter.query) {
    where.OR = [
      { name: { contains: filter.query, mode: "insensitive" } },
      { brand: { name: { contains: filter.query, mode: "insensitive" } } },
    ];
  }

  const [products, globalPercent] = await Promise.all([
    prisma.product.findMany({
      where,
      include: cardInclude,
      orderBy: { id: "asc" },
    }),
    getGlobalCashback(),
  ]);

  return (products as unknown as ProductWithRels[]).map((p) =>
    toCard(p, globalPercent),
  );
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      brand: { select: { name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      volumes: { where: { isActive: true }, orderBy: { volumeMl: "asc" } },
    },
  });

  if (!p || p.isArchived) return null;

  const globalPercent = await getGlobalCashback();
  const base = toCard(p as unknown as ProductWithRels, globalPercent);

  // Похожие: тот же бренд или гендер, не сам товар
  const similarRaw = await prisma.product.findMany({
    where: {
      isArchived: false,
      id: { not: p.id },
      OR: [{ brandId: p.brandId }, { gender: p.gender }],
    },
    include: cardInclude,
    take: 4,
  });

  return {
    ...base,
    notesTop: p.notesTop ?? undefined,
    notesMid: p.notesMid ?? undefined,
    notesBase: p.notesBase ?? undefined,
    description: p.description ?? undefined,
    volumes: p.volumes.map((v) => ({
      volumeMl: v.volumeMl,
      priceByn: Number(v.priceByn),
    })),
    similar: (similarRaw as unknown as ProductWithRels[]).map((sp) =>
      toCard(sp, globalPercent),
    ),
  };
}

export async function getBrands(): Promise<string[]> {
  const brands = await prisma.brand.findMany({
    where: { products: { some: { isArchived: false } } },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return brands.map((b) => b.name);
}

export interface FinderProduct extends ProductCard {
  /** склеенные ноты (для скоринга подбора аромата) */
  notes: string;
}

/** Товары для квиз-подборщика: карточка + строка нот. */
export async function getFinderProducts(): Promise<FinderProduct[]> {
  const [products, globalPercent] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: cardInclude,
      orderBy: { id: "asc" },
    }),
    getGlobalCashback(),
  ]);

  return (products as unknown as (ProductWithRels & {
    notesTop: string | null;
    notesMid: string | null;
    notesBase: string | null;
  })[]).map((p) => ({
    ...toCard(p, globalPercent),
    notes: [p.notesTop, p.notesMid, p.notesBase]
      .filter(Boolean)
      .join(", ")
      .toLowerCase(),
  }));
}
