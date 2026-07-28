import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import { saveSettings } from "@/lib/actions/settings";
import BrandsManager from "@/components/BrandsManager";
import AtomizersManager from "@/components/AtomizersManager";

export const dynamic = "force-dynamic";

async function getSetting(key: string, fallback: string) {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}

export default async function SettingsPage() {
  await requireRole(["admin"]);

  const [percent, days, threshold, brands, atomizers] = await Promise.all([
    getSetting("loyalty_percent", "5"),
    getSetting("loyalty_days", "180"),
    getSetting("low_stock_threshold", "50"),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    prisma.atomizer.findMany({ orderBy: [{ volumeMl: "asc" }, { name: "asc" }] }),
  ]);

  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl text-ivory">Настройки</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Лояльность и остатки */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Лояльность и остатки</h2>
          <form action={saveSettings} className="space-y-4">
            <div>
              <label htmlFor="loyalty_percent" className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
                Процент начисления баллов (%)
              </label>
              <input
                id="loyalty_percent" name="loyalty_percent" type="number" step="0.1" min="0"
                defaultValue={percent}
                className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="loyalty_days" className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
                Срок хранения баллов (дней, 0 = бессрочно)
              </label>
              <input
                id="loyalty_days" name="loyalty_days" type="number" min="0"
                defaultValue={days}
                className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="low_stock_threshold" className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
                Порог остатка по умолчанию (мл)
              </label>
              <input
                id="low_stock_threshold" name="low_stock_threshold" type="number" min="0"
                defaultValue={threshold}
                className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
            >
              Сохранить
            </button>
          </form>
        </div>

        {/* Бренды */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Бренды</h2>
          <BrandsManager
            brands={brands.map((b) => ({
              id: b.id,
              name: b.name,
              productCount: b._count.products,
            }))}
          />
        </div>

        {/* Атомайзеры */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Атомайзеры</h2>
          <AtomizersManager
            atomizers={atomizers.map((a) => ({
              id: a.id,
              name: a.name,
              volumeMl: a.volumeMl,
            }))}
          />
        </div>

        {/* Telegram */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6 lg:col-span-2">
          <h2 className="mb-2 font-serif text-xl text-ivory">Telegram-уведомления</h2>
          <p className="text-sm text-ivory-muted">
            Статус:{" "}
            {telegramConfigured ? (
              <span className="text-botanical-300">настроено</span>
            ) : (
              <span className="text-red-300">не настроено</span>
            )}
          </p>
          <p className="mt-2 text-xs text-ivory-faint">
            Токен бота и chat_id задаются через переменные окружения
            <code className="mx-1 rounded bg-ink-800 px-1.5 py-0.5 text-gold-400">TELEGRAM_BOT_TOKEN</code>
            и
            <code className="mx-1 rounded bg-ink-800 px-1.5 py-0.5 text-gold-400">TELEGRAM_CHAT_ID</code>.
            Уведомления о новых онлайн-заказах отправляются автоматически.
          </p>
        </div>
      </div>
    </div>
  );
}
