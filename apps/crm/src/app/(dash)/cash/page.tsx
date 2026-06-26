import Link from "next/link";
import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import CashRegister from "@/components/CashRegister";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  await requireRole(["admin", "seller"]);

  const products = await prisma.product.findMany({
    where: { isArchived: false },
    include: {
      brand: { select: { name: true } },
      volumes: { where: { isActive: true }, orderBy: { volumeMl: "asc" } },
    },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });

  const opts = products
    .filter((p) => p.volumes.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand.name,
      volumes: p.volumes.map((v) => ({
        volumeMl: v.volumeMl,
        priceByn: Number(v.priceByn),
      })),
    }));

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">Оффлайн-касса</h1>
          <p className="text-sm text-ivory-faint">
            Фиксация продаж в точке. При закрытии списываются остатки и начисляются баллы.
          </p>
        </div>
        <Link
          href="/cash/sales"
          className="rounded-full border border-gold-600/50 px-5 py-2.5 text-sm text-gold-400 transition-colors hover:border-gold-500"
        >
          Журнал продаж
        </Link>
      </div>
      <CashRegister products={opts} />
    </div>
  );
}
