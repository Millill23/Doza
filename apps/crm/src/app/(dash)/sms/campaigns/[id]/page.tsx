import { prisma, SmsCampaignRecipientStatus } from "@doza/db";
import { formatPhone } from "@doza/shared";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { retrySmsCampaign } from "@/lib/actions/sms-campaigns";

export const dynamic = "force-dynamic";

const LABELS: Record<SmsCampaignRecipientStatus, string> = {
  pending: "В очереди",
  sending: "В обработке",
  accepted: "Принято шлюзом",
  failed: "Ошибка отправки",
  skipped: "Пропущено",
  uncertain: "Результат неизвестен",
};
const PAGE_SIZE = 50;

export default async function SmsCampaignPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { status?: string; page?: string };
}) {
  await requireRole(["admin"]);
  const { id } = params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const campaign = await prisma.smsCampaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const status = Object.values(SmsCampaignRecipientStatus).find((value) => value === searchParams.status);
  const counts = await prisma.smsCampaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  const totals = new Map(counts.map((row) => [row.status, row._count._all]));
  const total = status ? totals.get(status) ?? 0 : counts.reduce((sum, row) => sum + row._count._all, 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(searchParams.page);
  const page = Number.isSafeInteger(requested) ? Math.min(pageCount, Math.max(1, requested)) : 1;
  const recipients = await prisma.smsCampaignRecipient.findMany({
    where: { campaignId: id, status },
    include: { customer: { select: { name: true, phone: true } } },
    orderBy: { id: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const path = `/sms/campaigns/${id}`;
  const pageUrl = (number: number) => `${path}?page=${number}${status ? `&status=${status}` : ""}`;

  return (
    <div className="space-y-4">
      <a href="/sms/campaigns" className="text-sm text-gold-300 hover:underline">← Кампании</a>
      <h1 className="font-serif text-3xl text-ivory">SMS-кампания</h1>
      <p className="max-w-2xl whitespace-pre-wrap break-words rounded-xl bg-ink-700 p-4">{campaign.text}</p>
      {Number(campaign.points) > 0 && (
        <p className="text-sm text-ivory-muted">
          Баллы на клиента: {campaign.points.toString()} · {campaign.reason}
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <a href={path} className="rounded-lg border border-ink-600 px-3 py-2">Все</a>
        {Object.values(SmsCampaignRecipientStatus).map((value) => (
          <a key={value} href={`${path}?status=${value}`}
            className={`rounded-lg border px-3 py-2 ${status === value ? "border-gold-500" : "border-ink-600"}`}>
            {LABELS[value]} · {totals.get(value) ?? 0}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a href={pageUrl(page)} className="text-gold-300 hover:underline">Обновить статусы</a>
        {(totals.get("failed") ?? 0) > 0 && (
          <form action={retrySmsCampaign.bind(null, id)}>
            <button className="rounded-lg border border-gold-500 px-3 py-2 text-gold-300">
              Повторить отправки со статусом «Ошибка отправки»
            </button>
          </form>
        )}
      </div>
      {(totals.get("uncertain") ?? 0) > 0 && (
        <p className="text-sm text-ivory-muted">
          При неизвестном результате проверьте отправку в кабинете SMS-провайдера. Повтора в очереди нет.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-ink-600">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800">
            <tr>
              <th className="p-3">Получатель</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Попытки</th>
              <th className="p-3">Баллы начислены</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((recipient) => (
              <tr key={recipient.id} className="border-t border-ink-600">
                <td className="p-3">{recipient.customer
                  ? `${recipient.customer.name} · ${formatPhone(recipient.customer.phone)}`
                  : "Клиент удалён"}</td>
                <td className="p-3">
                  {LABELS[recipient.status]}
                  {recipient.error && <div className="break-all text-xs text-ivory-faint">{recipient.error}</div>}
                </td>
                <td className="p-3">{recipient.attempts}</td>
                <td className="p-3">{recipient.pointsGranted ? "Да" : "—"}</td>
              </tr>
            ))}
            {!recipients.length && <tr><td colSpan={4} className="p-3">В этом списке пока пусто.</td></tr>}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label="Страницы получателей" className="flex gap-4 text-sm">
          {page > 1 && <a className="text-gold-300" href={pageUrl(page - 1)}>← Назад</a>}
          <span>{page} / {pageCount}</span>
          {page < pageCount && <a className="text-gold-300" href={pageUrl(page + 1)}>Далее →</a>}
        </nav>
      )}
    </div>
  );
}
