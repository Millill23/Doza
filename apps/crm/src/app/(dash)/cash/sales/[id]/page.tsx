import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@doza/db";
import { formatByn } from "@doza/shared";
import { requireRole } from "@/lib/session";
import CancelSale from "@/components/CancelSale";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Открыта",
  closed: "Закрыта",
  cancelled: "Отменена",
};

export default async function SaleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole(["admin", "seller"]);
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const sale = await prisma.offlineSale.findUnique({
    where: { id },
    include: {
      items: { include: { product: { include: { brand: true } } } },
      certificates: true,
      redemptions: { include: { certificate: { select: { code: true } } } },
      seller: { select: { name: true } },
      customer: { select: { id: true, name: true } },
      edits: { orderBy: { editedAt: "desc" } },
    },
  });
  if (!sale) notFound();

  const editors = await prisma.crmUser.findMany({
    where: { id: { in: sale.edits.map((e) => e.userId) } },
    select: { id: true, name: true },
  });
  const editorMap = new Map(editors.map((u) => [u.id, u.name]));

  // Отменённые списания в оплату не идут: их уже вернули на сертификат.
  const certPaid = sale.redemptions
    .filter((r) => !r.revokedAt)
    .reduce((sum, r) => sum + Number(r.amountByn), 0);
  const toPay = Number(sale.totalByn) - Number(sale.loyaltySpentByn) - certPaid;

  return (
    <div>
      <Link href="/cash/sales" className="mb-6 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К продажам
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="font-serif text-3xl text-ivory">Продажа №{sale.id}</h1>
        <span className="text-sm text-ivory-muted">{STATUS_LABEL[sale.status]}</span>
        <span className="text-sm text-ivory-faint">
          {sale.createdAt.toLocaleString("ru-RU")} · {sale.seller.name}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Состав */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">Состав</h2>
            <ul className="divide-y divide-ink-600/40">
              {sale.items.map((i) => (
                <li key={i.id} className="flex justify-between py-3 text-sm">
                  <span className="text-ivory">
                    {i.product.brand.name} — {i.product.name}, {i.volumeMl} мл × {i.qty}
                  </span>
                  <span className="text-gold-400">{formatByn(Number(i.priceByn) * i.qty)}</span>
                </li>
              ))}
              {sale.certificates.map((c) => (
                <li key={`c${c.id}`} className="flex justify-between py-3 text-sm">
                  <span className="text-ivory">🎁 Подарочный сертификат {formatByn(Number(c.denomination))} × {c.qty}</span>
                  <span className="text-gold-400">{formatByn(Number(c.denomination) * c.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1.5 border-t border-ink-600/60 pt-4 text-sm">
              <div className="flex justify-between text-ivory-muted">
                <span>Сумма</span><span>{formatByn(Number(sale.totalByn))}</span>
              </div>
              {Number(sale.loyaltySpentByn) > 0 && (
                <div className="flex justify-between text-botanical-300">
                  <span>Списано баллов</span><span>−{formatByn(Number(sale.loyaltySpentByn))}</span>
                </div>
              )}
              {sale.redemptions.map((r) => (
                <div
                  key={r.id}
                  className={`flex justify-between ${r.revokedAt ? "text-ivory-faint line-through" : "text-botanical-300"}`}
                >
                  <span>Сертификат {r.certificate.code}</span>
                  <span>−{formatByn(Number(r.amountByn))}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-medium text-ivory">
                <span>Оплачено деньгами</span>
                <span className="text-gold-gradient">{formatByn(toPay)}</span>
              </div>
            </div>
            {sale.customer && (
              <p className="mt-4 text-sm text-ivory-muted">
                Клиент:{" "}
                <Link href={`/customers/${sale.customer.id}`} className="text-gold-400 hover:text-gold-300">
                  {sale.customer.name}
                </Link>
              </p>
            )}
          </div>

          {/* Журнал изменений */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">Журнал изменений</h2>
            {sale.edits.length === 0 ? (
              <p className="text-sm text-ivory-faint">Изменений не было.</p>
            ) : (
              <ul className="space-y-3">
                {sale.edits.map((e) => (
                  <li key={e.id} className="rounded-lg border border-ink-600/60 bg-ink-800 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-ivory">{e.changeDescription}</span>
                      <span className="text-xs text-ivory-faint">
                        {e.editedAt.toLocaleString("ru-RU")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ivory-faint">
                      {editorMap.get(e.userId) ?? `Пользователь #${e.userId}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Действия */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6 lg:sticky lg:top-8 lg:self-start">
          <h2 className="mb-4 font-serif text-xl text-ivory">Действия</h2>
          {sale.status === "closed" ? (
            <CancelSale saleId={sale.id} />
          ) : (
            <p className="text-sm text-ivory-faint">
              {sale.status === "cancelled"
                ? "Продажа отменена. Остатки и баллы возвращены."
                : "Продажа открыта."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
