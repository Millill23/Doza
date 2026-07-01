import Link from "next/link";
import { requireRole } from "@/lib/session";
import OfflineRegister from "@/components/OfflineRegister";

export const dynamic = "force-dynamic";

export default async function RegisterCustomerPage() {
  await requireRole(["admin", "seller", "marketer"]);

  return (
    <div>
      <Link href="/customers" className="mb-4 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К клиентам
      </Link>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Регистрация клиента</h1>
      <p className="mb-6 text-sm text-ivory-faint">
        Введите данные клиента — ему придёт SMS с кодом для подтверждения.
      </p>
      <OfflineRegister />
    </div>
  );
}
