import { prisma } from "@doza/db";
import { isSoldOut, LOW_STOCK_ML, OUT_OF_STOCK_ML } from "@doza/db/stock-rules";
import { handler, ok } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Остатки по всему каталогу, от самых малых. */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const onlyProblem = url.searchParams.get("problem") === "1";

  const rows = await prisma.inventory.findMany({
    where: { product: { isArchived: false } },
    include: { product: { select: { id: true, name: true, brand: { select: { name: true } } } } },
    orderBy: { quantityMl: "asc" },
  });

  const items = rows
    .map((r) => ({
      productId: r.productId,
      name: `${r.product.brand.name} ${r.product.name}`,
      quantityMl: r.quantityMl,
      soldOut: isSoldOut(r.quantityMl),
      low: r.quantityMl < LOW_STOCK_ML,
      // Недосписанные доли миллилитра от потерь при распиве.
      spillCarry: r.spillCarry,
    }))
    .filter((i) => !onlyProblem || i.soldOut || i.low);

  return ok({
    thresholds: { soldOutBelowMl: OUT_OF_STOCK_ML, lowBelowMl: LOW_STOCK_ML },
    count: items.length,
    inventory: items,
  });
});
