import { requireRole } from "@/lib/session";
import SalesSplitManager from "@/components/SalesSplitManager";

export const dynamic = "force-dynamic";

export default async function SalesSplitsPage() {
  await requireRole(["admin"]);

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Разделение выручки</h1>
      <p className="mb-8 max-w-3xl text-sm text-ivory-faint">
        Если на смене работали двое под одним аккаунтом, здесь можно честно
        разнести выручку дня между продавцами. Влияет только на статистику продаж
        продавцов — чеки, остатки и баллы остаются как есть.
      </p>

      <div className="max-w-2xl">
        <SalesSplitManager />
      </div>
    </div>
  );
}
