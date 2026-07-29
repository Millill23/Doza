import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import PreorderForm from "@/components/PreorderForm";
import PreorderStatus from "@/components/PreorderStatus";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "В работе", cls: "text-botanical-300" },
  done: { label: "Выполнено", cls: "text-green-300" },
  cancelled: { label: "Отменён", cls: "text-ivory-faint" },
};

function fmt(d: Date): string {
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PreordersPage() {
  await requireRole(["admin", "seller"]);

  const preorders = await prisma.preorder.findMany({
    include: { seller: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Предзаказы</h1>
      <p className="mb-8 text-sm text-ivory-faint">
        Заявки на целый флакон, которого нет в каталоге. Продавец фиксирует
        пожелание и контакт клиента — дальше вручную. При создании приходит
        оповещение в Telegram.
      </p>

      <div className="mb-8">
        <PreorderForm />
      </div>

      {preorders.length === 0 ? (
        <p className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
          Заявок пока нет.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-600/60">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
              <tr>
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Пожелание</th>
                <th className="px-4 py-3">Продавец</th>
                <th className="px-4 py-3">Создан</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {preorders.map((p) => {
                const st = STATUS[p.status] ?? STATUS.new;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-ink-600/40 bg-ink-700 align-top"
                  >
                    <td className="px-4 py-3">
                      <div className="text-ivory">{p.customerName}</div>
                      <div className="text-xs text-ivory-faint">{p.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-ivory-muted">
                      {p.wish}
                      {p.note && (
                        <div className="mt-1 text-xs text-ivory-faint">
                          {p.note}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-faint">
                      {p.seller.name}
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-faint">
                      {fmt(p.createdAt)}
                    </td>
                    <td className={`px-4 py-3 text-xs ${st.cls}`}>{st.label}</td>
                    <td className="px-4 py-3 text-right">
                      <PreorderStatus id={p.id} status={p.status} />
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
