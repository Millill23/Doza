import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, type HandlerCtx } from "@/lib/api-auth";
import { slugify } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return ok({
    brands: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, products: b._count.products })),
  });
});

/** Завести бренд. Уже существующий возвращаем как есть – так вызов идемпотентен. */
export const POST = handler(async (request: Request, ctx: HandlerCtx) => {
  const { name } = await body<{ name?: string }>(request);
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fail("Укажите название бренда");

  const existing = await prisma.brand.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return ok({ brand: existing, created: false });

  const brand = await prisma.brand.create({
    data: { name: trimmed, slug: slugify(trimmed) || `brand-${Date.now()}` },
  });
  ctx.audit(`заведён бренд «${trimmed}»`);
  revalidatePath("/settings");
  return ok({ brand, created: true }, 201);
});
