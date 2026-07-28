"use server";

import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

const ALLOWED_KEYS = ["loyalty_percent", "loyalty_days", "low_stock_threshold"];

export async function saveSettings(formData: FormData) {
  await requireRole(["admin"]);
  for (const key of ALLOWED_KEYS) {
    const value = formData.get(key);
    if (value == null) continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  revalidatePath("/settings");
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

export async function addBrand(name: string) {
  await requireRole(["admin"]);
  const trimmed = name.trim();
  if (!trimmed) return;
  const slug = slugify(trimmed) || `brand-${Date.now()}`;
  await prisma.brand.create({ data: { name: trimmed, slug } });
  revalidatePath("/settings");
}

export async function deleteBrand(id: number) {
  await requireRole(["admin"]);
  const count = await prisma.product.count({ where: { brandId: id } });
  if (count > 0) throw new Error("Нельзя удалить бренд с товарами");
  await prisma.brand.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function addAtomizer(name: string, volumeMl: number) {
  await requireRole(["admin"]);
  const trimmed = name.trim();
  const vol = Math.floor(Number(volumeMl));
  if (!trimmed) throw new Error("Укажите название атомайзера");
  if (!vol || vol <= 0) throw new Error("Укажите объём (мл)");
  await prisma.atomizer.create({ data: { name: trimmed, volumeMl: vol } });
  revalidatePath("/settings");
  revalidatePath("/cash");
}

export async function deleteAtomizer(id: number) {
  await requireRole(["admin"]);
  await prisma.atomizer.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/cash");
}
