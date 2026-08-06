import Link from "next/link";
import { requireRole } from "@/lib/session";
import CertificateActivate from "@/components/CertificateActivate";

export const dynamic = "force-dynamic";

export default async function CertificateActivatePage() {
  await requireRole(["admin", "seller"]);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-1 font-serif text-3xl text-ivory">
            Активация сертификата
          </h1>
          <p className="max-w-2xl text-sm text-ivory-faint">
            Клиенту начисляются баллы на сумму сертификата. VIP-клиенту
            начисляется сумма, за которую сертификат был куплен.
          </p>
        </div>
        <Link
          href="/certificates"
          className="rounded-full border border-gold-600/50 px-5 py-2.5 text-sm text-gold-400 transition-colors hover:border-gold-500"
        >
          К выпуску
        </Link>
      </div>

      <CertificateActivate />
    </div>
  );
}
