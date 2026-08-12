import Link from "next/link";
import { requireRole } from "@/lib/session";
import { toLocalDigits } from "@doza/shared/phone";
import OfflineRegister from "@/components/OfflineRegister";

export const dynamic = "force-dynamic";

export default async function RegisterCustomerPage({
  searchParams,
}: {
  searchParams: { phone?: string };
}) {
  await requireRole(["admin", "seller", "marketer"]);

  // Номер приходит из кассы, когда поиск не дал результата — продавцу остаётся
  // ввести только имя.
  const phone = toLocalDigits(searchParams.phone ?? "");

  return (
    <div>
      <Link href="/customers" className="mb-4 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К клиентам
      </Link>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Регистрация клиента</h1>
      <p className="mb-6 text-sm text-ivory-faint">
        Клиенту придёт SMS со ссылкой на согласие с обработкой персональных
        данных — без него баллы начисляться не будут.
      </p>
      <OfflineRegister initialPhone={phone} />
    </div>
  );
}
