"use server";

import { prisma } from "@doza/db";
import { submitIndexNow, SITE_HOST } from "@doza/shared/indexnow";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import {
  writeProduct,
  slugify,
  uniqueSlug,
  type ProductPayload,
  type VolumeInput,
  type PhotoInput,
} from "@/lib/catalog";

export type { ProductPayload, VolumeInput, PhotoInput };

/** Уведомить поисковики (IndexNow) об изменении товара. */
function pingIndexNow(slug: string) {
  void submitIndexNow([
    `https://${SITE_HOST}/product/${slug}`,
    `https://${SITE_HOST}/catalog`,
    `https://${SITE_HOST}/sitemap.xml`,
  ]);
}

/**
 * Сохранить товар из CRM.
 *
 * Сама запись живёт в `@/lib/catalog` – тем же кодом пользуется техническая
 * апишка. Здесь остаются проверка прав, сброс кеша страниц и пинг поисковиков:
 * всё то, что имеет смысл только для запроса из браузера.
 */
export async function saveProduct(payload: ProductPayload): Promise<number> {
  await requireRole(["admin"]);
  const res = await writeProduct(payload);

  revalidatePath("/products");
  revalidatePath(`/products/${res.id}/edit`);
  if (!payload.isArchived) pingIndexNow(res.slug);
  return res.id;
}

export async function duplicateProduct(id: number) {
  await requireRole(["admin"]);
  const src = await prisma.product.findUnique({
    where: { id },
    include: { volumes: true, photos: true },
  });
  if (!src) throw new Error("Товар не найден");

  const slug = await uniqueSlug(slugify(`${src.name}-kopiya`));
  const copy = await prisma.product.create({
    data: {
      brandId: src.brandId,
      name: `${src.name} (копия)`,
      slug,
      gender: src.gender,
      description: src.description,
      notesTop: src.notesTop,
      notesMid: src.notesMid,
      notesBase: src.notesBase,
      lowStockThreshold: src.lowStockThreshold,
      loyaltyPercentOverride: src.loyaltyPercentOverride,
      isArchived: true,
      inventory: { create: { quantityMl: 0 } },
      volumes: {
        create: src.volumes.map((v) => ({
          volumeMl: v.volumeMl,
          priceByn: v.priceByn,
          isActive: v.isActive,
        })),
      },
      photos: {
        create: src.photos.map((p) => ({ url: p.url, sortOrder: p.sortOrder })),
      },
    },
  });
  revalidatePath("/products");
  redirect(`/products/${copy.id}/edit`);
}
