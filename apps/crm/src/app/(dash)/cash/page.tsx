import Link from "next/link";
import { prisma } from "@doza/db";
import { pickActivePromo, getGlobalPromo, getActiveSuperPromo } from "@doza/db/promos";
import { requireRole } from "@/lib/session";
import CashRegister from "@/components/CashRegister";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const session = await requireRole(["admin", "seller"]);
  const isAdmin = session.user.role === "admin";

  const products = await prisma.product.findMany({
    where: { isArchived: false },
    include: {
      brand: { select: { name: true } },
      volumes: { where: { isActive: true }, orderBy: { volumeMl: "asc" } },
      promos: {
        select: {
          discountPercent: true,
          cashbackPercent: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });

  const atomizers = await prisma.atomizer.findMany({
    where: { isActive: true },
    orderBy: [{ volumeMl: "asc" }, { name: "asc" }],
  });

  const now = new Date();

  // Акция «на все товары» и супер-акция + список продавцов (для админа).
  const [globalPromo, superPromo, sellers, socialSettings] = await Promise.all([
    getGlobalPromo(now),
    getActiveSuperPromo(now),
    isAdmin
      ? prisma.crmUser.findMany({
          where: { isActive: true, role: { in: ["admin", "seller"] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.setting.findMany({
      where: { key: { in: ["social_subscribe_percent", "social_story_percent"] } },
    }),
  ]);

  const settingNum = (key: string, fallback: number) => {
    const s = socialSettings.find((x) => x.key === key);
    return s ? Number(s.value) : fallback;
  };

  const opts = products
    .filter((p) => p.volumes.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand.name,
      // Адресная акция товара или акция «на все товары» — что больше.
      discountPercent: Math.max(
        pickActivePromo(
          p.promos.map((pr) => ({
            discountPercent: pr.discountPercent != null ? Number(pr.discountPercent) : null,
            cashbackPercent: pr.cashbackPercent != null ? Number(pr.cashbackPercent) : null,
            startsAt: pr.startsAt,
            endsAt: pr.endsAt,
          })),
          now,
        ).discountPercent,
        globalPromo.discountPercent,
      ),
      inSuperPromo: superPromo ? superPromo.isEligible(p.id) : false,
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
      <CashRegister
        products={opts}
        atomizers={atomizers.map((a) => ({
          id: a.id,
          name: a.name,
          volumeMl: a.volumeMl,
        }))}
        superPromo={
          superPromo
            ? { name: superPromo.name, groupSize: superPromo.groupSize }
            : null
        }
        sellers={sellers}
        currentUserId={Number(session.user.id)}
        subscribePercent={settingNum("social_subscribe_percent", 5)}
        storyPercent={settingNum("social_story_percent", 5)}
      />
    </div>
  );
}
