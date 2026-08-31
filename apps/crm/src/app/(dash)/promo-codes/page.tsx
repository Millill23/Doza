import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import PromoCodesApp from "@/components/PromoCodesApp";

export const dynamic = "force-dynamic";

/**
 * Промокоды.
 *
 * Рядом со списком — сколько заказов и продаж прошло по каждому коду: без
 * этого числа список превращается в свалку, где не видно, что работает.
 */
export default async function PromoCodesPage() {
  await requireRole(["admin"]);

  const [codes, influencers] = await Promise.all([
    prisma.promoCode.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        influencer: { select: { id: true, name: true } },
        _count: { select: { orders: true, offlineSales: true } },
      },
    }),
    prisma.crmUser.findMany({
      where: { role: "influencer", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PromoCodesApp
      codes={codes.map((c) => ({
        id: c.id,
        code: c.code,
        comment: c.comment,
        discountPercent: Number(c.discountPercent),
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        isActive: c.isActive,
        influencer: c.influencer,
        uses: c._count.orders + c._count.offlineSales,
      }))}
      influencers={influencers}
    />
  );
}
