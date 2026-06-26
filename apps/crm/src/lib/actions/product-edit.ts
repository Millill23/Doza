"use server";

import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

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

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = base || `product-${Date.now()}`;
  let n = 1;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${++n}`;
  }
}

export async function saveProduct(payload: ProductPayload): Promise<number> {
  await requireRole(["admin"]);

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

  const productId = await prisma.$transaction(async (tx) => {
    // 1. Товар
    const product = payload.id
      ? await tx.product.update({ where: { id: payload.id }, data })
      : await tx.product.create({
          data: { ...data, inventory: { create: { quantityMl: 0 } } },
        });
    const pid = product.id;

    // 2. Объёмы — синхронизация
    const existingVols = await tx.productVolume.findMany({ where: { productId: pid } });
    const keepVolIds = new Set(payload.volumes.filter((v) => v.id).map((v) => v.id));
    for (const ev of existingVols) {
      if (!keepVolIds.has(ev.id))
        await tx.productVolume.delete({ where: { id: ev.id } });
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
          data: { productId: pid, volumeMl: v.volumeMl, priceByn: v.priceByn, isActive: v.isActive },
        });
      }
    }

    // 3. Фото — синхронизация
    const existingPhotos = await tx.productPhoto.findMany({ where: { productId: pid } });
    const keepPhotoIds = new Set(payload.photos.filter((p) => p.id).map((p) => p.id));
    for (const ep of existingPhotos) {
      if (!keepPhotoIds.has(ep.id))
        await tx.productPhoto.delete({ where: { id: ep.id } });
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

    // 4. Похожие — полная пересборка
    await tx.productSimilar.deleteMany({ where: { productId: pid } });
    const similar = payload.similarIds.filter((sid) => sid !== pid);
    for (const sid of similar) {
      await tx.productSimilar.create({ data: { productId: pid, similarId: sid } });
    }

    return pid;
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}/edit`);
  return productId;
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
