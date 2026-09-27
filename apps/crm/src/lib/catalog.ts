import { prisma } from "@doza/db";

/**
 * Запись в каталог: товары, остатки, архив.
 *
 * Отдельно от server actions намеренно. Те проверяют сессию CRM и годятся
 * только для запросов из браузера с куками; техническая апишка ходит с
 * Bearer-токеном, сессии у неё нет. Раз правил у каталога одни, то и код
 * должен быть один – иначе через полгода в CRM и в апишке разъедется,
 * например, генерация slug, и одинаковые товары получат разные адреса.
 *
 * Проверка прав – забота вызывающего: здесь её нет намеренно.
 */

export interface VolumeInput {
  id?: number;
  volumeMl: number;
  priceByn: number;
  isActive: boolean;
}

export interface PhotoInput {
  id?: number;
  url: string;
  sortOrder: number;
}

export interface ProductPayload {
  id?: number;
  brandId: number;
  name: string;
  slug?: string;
  gender: "male" | "female" | "unisex";
  description?: string;
  notesTop?: string;
  notesMid?: string;
  notesBase?: string;
  lowStockThreshold?: number | null;
  loyaltyPercentOverride?: number | null;
  isArchived?: boolean;
  volumes: VolumeInput[];
  photos: PhotoInput[];
  similarIds: number[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

/** Свободный slug. Занят – добавляем номер, пока не найдётся свободный. */
export async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = base || `product-${Date.now()}`;
  let n = 1;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${++n}`;
  }
}

export interface WriteProductResult {
  id: number;
  slug: string;
  created: boolean;
}

/**
 * Создать или обновить товар целиком: поля, объёмы, фото, похожие.
 *
 * Объёмы и фото синхронизируются, а не дописываются: всё, чего нет в
 * присланном списке, удаляется. Так правка из CRM и из апишки означают одно и
 * то же – «вот полный состав», а не «добавь ещё».
 */
export async function writeProduct(payload: ProductPayload): Promise<WriteProductResult> {
  if (!payload.name?.trim()) throw new Error("Укажите название");
  if (!payload.brandId) throw new Error("Выберите бренд");

  const slugBase = slugify(payload.slug?.trim() || payload.name);
  const slug = await uniqueSlug(slugBase, payload.id);

  const data = {
    brandId: payload.brandId,
    name: payload.name.trim(),
    slug,
    gender: payload.gender,
    description: payload.description?.trim() || null,
    notesTop: payload.notesTop?.trim() || null,
    notesMid: payload.notesMid?.trim() || null,
    notesBase: payload.notesBase?.trim() || null,
    lowStockThreshold: payload.lowStockThreshold ?? null,
    loyaltyPercentOverride: payload.loyaltyPercentOverride ?? null,
    isArchived: payload.isArchived ?? false,
  };

  return prisma.$transaction(async (tx) => {
    const product = payload.id
      ? await tx.product.update({ where: { id: payload.id }, data })
      : await tx.product.create({
          data: { ...data, inventory: { create: { quantityMl: 0 } } },
        });
    const pid = product.id;

    // Объёмы
    const existingVols = await tx.productVolume.findMany({ where: { productId: pid } });
    const keepVolIds = new Set(payload.volumes.filter((v) => v.id).map((v) => v.id));
    for (const ev of existingVols) {
      if (!keepVolIds.has(ev.id)) await tx.productVolume.delete({ where: { id: ev.id } });
    }
    for (const v of payload.volumes) {
      if (v.volumeMl <= 0) continue;
      if (v.id) {
        await tx.productVolume.update({
          where: { id: v.id },
          data: { volumeMl: v.volumeMl, priceByn: v.priceByn, isActive: v.isActive },
        });
      } else {
        await tx.productVolume.create({
          data: {
            productId: pid,
            volumeMl: v.volumeMl,
            priceByn: v.priceByn,
            isActive: v.isActive,
          },
        });
      }
    }

    // Фото
    const existingPhotos = await tx.productPhoto.findMany({ where: { productId: pid } });
    const keepPhotoIds = new Set(payload.photos.filter((p) => p.id).map((p) => p.id));
    for (const ep of existingPhotos) {
      if (!keepPhotoIds.has(ep.id)) await tx.productPhoto.delete({ where: { id: ep.id } });
    }
    for (const p of payload.photos) {
      if (!p.url.trim()) continue;
      if (p.id) {
        await tx.productPhoto.update({
          where: { id: p.id },
          data: { url: p.url.trim(), sortOrder: p.sortOrder },
        });
      } else {
        await tx.productPhoto.create({
          data: { productId: pid, url: p.url.trim(), sortOrder: p.sortOrder },
        });
      }
    }

    // Похожие – полная пересборка. Сам на себя товар не ссылается.
    await tx.productSimilar.deleteMany({ where: { productId: pid } });
    for (const sid of payload.similarIds.filter((sid) => sid !== pid)) {
      await tx.productSimilar.create({ data: { productId: pid, similarId: sid } });
    }

    return { id: pid, slug, created: !payload.id };
  });
}

/**
 * Выставить остаток с записью в журнал.
 *
 * `userId` – кто правил. null означает техническую апишку: сотрудника за этим
 * действием нет, и придумывать его в журнале нельзя.
 */
export async function setStockMl(
  productId: number,
  quantityMl: number,
  userId: number | null,
): Promise<{ before: number; after: number }> {
  const current = await prisma.inventory.findUnique({ where: { productId } });
  const before = current?.quantityMl ?? 0;
  const after = Math.round(quantityMl);
  const delta = after - before;

  await prisma.inventory.upsert({
    where: { productId },
    update: { quantityMl: after },
    create: { productId, quantityMl: after },
  });

  if (delta !== 0) {
    await prisma.inventoryLog.create({
      data: { productId, deltaMl: delta, reason: "manual_adjust", userId },
    });
  }

  return { before, after };
}

/** Снять с витрины или вернуть на неё. */
export async function setArchived(productId: number, archived: boolean): Promise<void> {
  await prisma.product.update({
    where: { id: productId },
    data: { isArchived: archived },
  });
}
