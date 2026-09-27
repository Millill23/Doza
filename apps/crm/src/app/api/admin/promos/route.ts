import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, body, type HandlerCtx } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Акции: скидка и повышенный кешбэк на срок.
 *
 * `productId = null` – акция на весь каталог. Строки, заведённые подборкой
 * «Парфюм недели», сюда тоже попадают, но трогать их через эту ручку не надо:
 * ими управляет сама подборка, и ручное удаление оставит её без скидок.
 */
export const GET = handler(async (request: Request) => {
  const activeOnly = new URL(request.url).searchParams.get("active") === "1";
  const now = new Date();

  const promos = await prisma.promo.findMany({
    where: activeOnly
      ? {
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        }
      : {},
    include: { product: { select: { id: true, name: true, brand: { select: { name: true } } } } },
    orderBy: { id: "desc" },
    take: 200,
  });

  return ok({
    promos: promos.map((p) => ({
      id: p.id,
      product: p.product
        ? { id: p.product.id, name: `${p.product.brand.name} ${p.product.name}` }
        : null,
      scope: p.productId ? "product" : "all",
      discountPercent: p.discountPercent == null ? null : Number(p.discountPercent),
      cashbackPercent: p.cashbackPercent == null ? null : Number(p.cashbackPercent),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      fromWeeklyPromo: p.weeklyPromoId != null,
    })),
  });
});

export const POST = handler(async (request: Request, ctx: HandlerCtx) => {
  const input = await body<{
    productId?: number | null;
    discountPercent?: number | null;
    cashbackPercent?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
  }>(request);

  if (input.discountPercent == null && input.cashbackPercent == null) {
    return fail("Укажите discountPercent или cashbackPercent – иначе акция ничего не делает");
  }
  if (input.productId != null) {
    const p = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!p) return fail("Товар не найден", 404);
  }

  const promo = await prisma.promo.create({
    data: {
      productId: input.productId ?? null,
      discountPercent: input.discountPercent ?? null,
      cashbackPercent: input.cashbackPercent ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    },
  });

  ctx.audit(
    `акция #${promo.id}: ${input.productId ? `товар #${input.productId}` : "весь каталог"}, ` +
      `скидка ${input.discountPercent ?? 0}%, кешбэк ${input.cashbackPercent ?? 0}%`,
  );
  revalidatePath("/promos");
  return ok({ promo }, 201);
});

export const DELETE = handler(async (request: Request, ctx: HandlerCtx) => {
  const { id } = await body<{ id?: number }>(request);
  if (!id) return fail("Укажите id акции");

  const promo = await prisma.promo.findUnique({ where: { id } });
  if (!promo) return fail("Акция не найдена", 404);
  if (promo.weeklyPromoId != null) {
    return fail("Эта акция заведена подборкой «Парфюм недели» – удаляйте саму подборку");
  }

  await prisma.promo.delete({ where: { id } });
  ctx.audit(`удалена акция #${id}`);
  revalidatePath("/promos");
  return ok({ deleted: true, id });
});
