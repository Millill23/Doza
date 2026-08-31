import Link from "next/link";
import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import CertificateIssue from "@/components/CertificateIssue";
import {
  CERTIFICATE_DENOMINATIONS,
  CERTIFICATE_LIFETIME_DAYS,
  daysLeft,
} from "@doza/db/certificates";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Действует", cls: "text-botanical-300" },
  activated: { label: "Обменян на баллы", cls: "text-ivory-faint" },
  spent: { label: "Израсходован", cls: "text-ivory-faint" },
  cancelled: { label: "Аннулирован", cls: "text-red-300" },
};

export default async function CertificatesPage() {
  await requireRole(["admin", "seller"]);

  const certificates = await prisma.giftCertificate.findMany({
    include: {
      issuedBy: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });

  // «Действующий» — с остатком и не просроченный: именно столько денег магазин
  // ещё должен покупателям.
  const now = new Date();
  const active = certificates.filter(
    (c) => c.status === "new" && c.expiresAt > now,
  ).length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">Сертификаты</h1>
          <p className="text-sm text-ivory-faint">
            Действующих: {active}. Срок жизни — {CERTIFICATE_LIFETIME_DAYS} дней
            с выпуска. Сертификатом можно расплатиться в кассе (остаток
            сохраняется) либо один раз обменять его на баллы.
          </p>
        </div>
        <Link
          href="/certificates/activate"
          className="rounded-full border border-gold-600/50 px-5 py-2.5 text-sm text-gold-400 transition-colors hover:border-gold-500"
        >
          Активировать сертификат
        </Link>
      </div>

      <div className="mb-8 max-w-lg">
        <CertificateIssue denominations={[...CERTIFICATE_DENOMINATIONS]} />
      </div>

      {certificates.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Сертификатов пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">Код</th>
                <th className="px-4 py-3">Номинал</th>
                <th className="px-4 py-3">Остаток</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Действует до</th>
                <th className="px-4 py-3">Активировал</th>
                <th className="px-4 py-3">Выпущен</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((c) => {
                const expired = c.expiresAt <= new Date();
                const st = expired && c.status === "new"
                  ? { label: "Просрочен", cls: "text-red-300" }
                  : (STATUS[c.status] ?? STATUS.new);
                const left = Number(c.balanceByn);
                return (
                  <tr key={c.id} className="border-t border-ink-600/40 bg-ink-700">
                    <td className="px-4 py-3 font-mono tracking-widest text-gold-300">
                      {c.code}
                    </td>
                    <td className="px-4 py-3 text-ivory">
                      {Number(c.denomination).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-ivory">
                      {left > 0 ? (
                        <span className="text-gold-400">{left.toFixed(2)}</span>
                      ) : (
                        <span className="text-ivory-faint">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${st.cls}`}>
                      {st.label}
                      {c.status === "activated" && c.awardedByn != null && (
                        <span className="ml-1 text-gold-400">
                          +{Number(c.awardedByn).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${expired ? "text-red-300" : "text-ivory-muted"}`}>
                      {c.expiresAt.toLocaleDateString("ru-RU")}
                      {!expired && c.status === "new" && (
                        <span className="ml-1 text-ivory-faint">
                          ({daysLeft(c.expiresAt)} дн.)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-muted">
                      {c.customer
                        ? `${c.customer.name} (${c.customer.phone})`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-faint">
                      {fmt(c.issuedAt)} · {c.issuedBy?.name ?? "куплен на сайте"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
