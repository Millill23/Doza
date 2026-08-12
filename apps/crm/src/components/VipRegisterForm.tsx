"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerVip } from "@/lib/actions/customers";
import PhoneInput from "@/components/PhoneInput";
import { BELARUS_PREFIX } from "@doza/shared/phone";

export default function VipRegisterForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-gold-600/50 px-5 py-2.5 text-sm text-gold-400 transition-colors hover:border-gold-500"
      >
        ⭐ Зарегистрировать VIP
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-gold-600/40 bg-ink-700 p-4">
      <p className="mb-3 text-sm font-medium text-gold-300">
        Регистрация VIP-клиента (скидка 20% на всё)
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <PhoneInput value={phone} onChange={setPhone} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          className="h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        <input
          value={card}
          onChange={(e) => setCard(e.target.value)}
          placeholder="№ карты (091)"
          className="h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() =>
            start(async () => {
              try {
                setErr(null);
                await registerVip(BELARUS_PREFIX + phone, name, card);
                setPhone("");
                setName("");
                setCard("");
                setOpen(false);
                router.refresh();
              } catch (e) {
                setErr((e as Error).message);
              }
            })
          }
          disabled={pending}
          className="rounded-full bg-gold-gradient px-5 py-2 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Зарегистрировать"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-full border border-ink-600 px-5 py-2 text-sm text-ivory-muted hover:border-gold-500"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
