import { prisma } from "@doza/db";

export async function getEditorRefs(excludeId?: number) {
  const [brands, others] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: excludeId ? { id: { not: excludeId } } : {},
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
  ]);
  return {
    brands,
    others: others.map((o) => ({ id: o.id, name: o.name, brand: o.brand.name })),
  };
}
