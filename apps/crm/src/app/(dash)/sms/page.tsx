import { prisma } from "@doza/db";
import { SMS_KINDS, SMS_KIND_LIST, isSmsKind } from "@doza/db/sms-rules";
import { formatPhone } from "@doza/shared";
import { requireRole } from "@/lib/session";
import { getSmsSettings } from "@/lib/actions/sms";
import SmsSettingsPanel from "@/components/SmsSettingsPanel";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function SmsPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  await requireRole(["admin"]);

  const kindFilter = searchParams.kind && isSmsKind(searchParams.kind)
    ? searchParams.kind
    : null;
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [settings, log, counts, users] = await Promise.all([
    getSmsSettings(),
    prisma.smsLog.findMany({
      where: kindFilter ? { kind: kindFilter } : {},
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.smsLog.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: since30d }, ok: true },
      _count: { _all: true },
    }),
    prisma.crmUser.findMany({ select: { id: true, name: true } }),
  ]);

  const sentByKind = new Map(counts.map((c) => [c.kind, c._count._all]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const kinds = SMS_KIND_LIST.map((k) => ({
    kind: k,
    label: SMS_KINDS[k].label,
    hint: SMS_KINDS[k].hint,
    required: SMS_KINDS[k].required,
    enabled: settings.kinds[k] ?? true,
    sent30d: sentByKind.get(k) ?? 0,
  }));

  const total30d = [...sentByKind.values()].reduce((s, n) => s + n, 0);

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">SMS-рассылки</h1>
      <p className="mb-8 max-w-3xl text-sm leading-relaxed text-ivory-faint">
        Что уходит клиентам и от кого. За последние 30 дней отправлено{" "}
        <span className="text-ivory">{total30d}</span> сообщений. Повторные
        напоминания о согласии ограничены: не чаще раза в неделю и не больше
        трёх на человека.
      </p>

      <div className="mb-10">
        <SmsSettingsPanel
          master={settings.master}
          telegram={settings.telegram}
          kinds={kinds}
        />
      </div>

      <h2 className="mb-3 font-serif text-xl text-ivory">Журнал отправок</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/sms"
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            !kindFilter
              ? "border-gold-500 bg-gold-500/15 text-gold-300"
              : "border-ink-600 text-ivory-muted hover:border-gold-500"
          }`}
        >
          Все
        </a>
        {SMS_KIND_LIST.map((k) => (
          <a
            key={k}
            href={`/sms?kind=${k}`}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              kindFilter === k
                ? "border-gold-500 bg-gold-500/15 text-gold-300"
                : "border-ink-600 text-ivory-muted hover:border-gold-500"
            }`}
          >
            {SMS_KINDS[k].label}
          </a>
        ))}
      </div>

      {log.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Отправок пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">Когда</th>
                <th className="px-4 py-3">Кому</th>
                <th className="px-4 py-3">Категория</th>
                <th className="px-4 py-3">Текст</th>
                <th className="px-4 py-3">Кто отправил</th>
                <th className="px-4 py-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id} className="border-t border-ink-600/40 bg-ink-700 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ivory-faint">
                    {r.createdAt.toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ivory-muted">
                    {r.customerId ? (
                      <a
                        href={`/customers/${r.customerId}`}
                        className="text-gold-400 hover:text-gold-300"
                      >
                        {formatPhone(r.phone)}
                      </a>
                    ) : (
                      formatPhone(r.phone)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ivory-muted">
                    {isSmsKind(r.kind) ? SMS_KINDS[r.kind].label : r.kind}
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs leading-relaxed text-ivory-faint">
                    {r.text}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ivory-muted">
                    {r.userId ? (userName.get(r.userId) ?? `#${r.userId}`) : "сайт"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {r.ok ? (
                      <span className="text-green-300">доставлено</span>
                    ) : (
                      <span className="text-red-300" title={r.error ?? undefined}>
                        не ушло
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
