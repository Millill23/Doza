import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import SmsCampaignForm from "@/components/SmsCampaignForm";

export const dynamic = "force-dynamic";

export default async function SmsCampaignsPage() {
  await requireRole(["admin"]);
  const [eligibleCount, campaigns] = await Promise.all([
    prisma.customer.count({ where: { consentStatus: "confirmed" } }),
    prisma.smsCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, text: true, createdAt: true, _count: { select: { recipients: true } } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <a href="/sms" className="text-sm text-gold-300 hover:underline">← SMS и настройки</a>
      <h1 className="font-serif text-3xl text-ivory">Массовая SMS-рассылка</h1>
      <SmsCampaignForm eligibleCount={eligibleCount} />
      <h2 className="font-serif text-xl text-ivory">Последние кампании</h2>
      {campaigns.length === 0 && <p className="text-ivory-faint">Рассылок пока нет.</p>}
      <ul className="max-w-2xl divide-y divide-ink-600">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="py-3">
            <a href={`/sms/campaigns/${campaign.id}`} className="block truncate text-gold-300 hover:underline">
              {campaign.text}
            </a>
            <p className="text-sm text-ivory-faint">
              {campaign.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Minsk" })} ·
              {" "}получателей: {campaign._count.recipients}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
