import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import TestsApp from "@/components/TestsApp";

export const dynamic = "force-dynamic";

/**
 * Проверки для админа.
 *
 * Раздел для того, кто настраивает магазин: посмотреть, как выглядит то, что
 * получает покупатель, не собирая для этого настоящий заказ.
 */
export default async function TestsPage() {
  await requireRole(["admin"]);

  // Только живые сертификаты: отправлять ссылку на использованный или
  // просроченный незачем — проверять будет нечего.
  const certificates = await prisma.giftCertificate.findMany({
    where: { balanceByn: { gt: 0 }, expiresAt: { gt: new Date() } },
    orderBy: { issuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      denomination: true,
      balanceByn: true,
      publicToken: true,
      issuedAt: true,
      buyer: { select: { name: true } },
    },
  });

  return (
    <TestsApp
      certificates={certificates.map((c) => ({
        id: c.id,
        code: c.code,
        denomination: Number(c.denomination),
        balance: Number(c.balanceByn),
        hasLink: Boolean(c.publicToken),
        issuedAt: c.issuedAt.toISOString(),
        buyer: c.buyer?.name ?? null,
      }))}
    />
  );
}
