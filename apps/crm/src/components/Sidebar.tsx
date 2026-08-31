"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type Role = "admin" | "seller" | "marketer" | "influencer";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "Дашборд", roles: ["admin", "seller", "marketer"] },
  // Блогер видит ровно один раздел: свои продажи. Ни дашборда, ни клиентов —
  // это чужие персональные данные, и ему они ни к чему.
  { href: "/my-sales", label: "Продажи", roles: ["influencer"] },
  { href: "/orders", label: "Заказы", roles: ["admin", "seller"] },
  { href: "/cash", label: "Оффлайн-касса", roles: ["admin", "seller"] },
  { href: "/preorders", label: "Предзаказы", roles: ["admin", "seller"] },
  { href: "/certificates", label: "Сертификаты", roles: ["admin", "seller"] },
  { href: "/products", label: "Товары", roles: ["admin"] },
  { href: "/promos", label: "Акции", roles: ["admin"] },
  { href: "/super-promos", label: "Супер акции", roles: ["admin"] },
  { href: "/weekly-promo", label: "Парфюм недели", roles: ["admin"] },
  { href: "/promo-codes", label: "Промокоды", roles: ["admin"] },
  { href: "/customers", label: "Клиенты", roles: ["admin", "seller", "marketer"] },
  { href: "/loyalty", label: "Лояльность", roles: ["admin", "marketer"] },
  { href: "/analytics", label: "Аналитика", roles: ["admin", "marketer"] },
  { href: "/sales-splits", label: "Разделение выручки", roles: ["admin"] },
  { href: "/sms", label: "SMS-рассылки", roles: ["admin"] },
  { href: "/settings", label: "Настройки", roles: ["admin"] },
  { href: "/users", label: "Пользователи", roles: ["admin"] },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  seller: "Продавец",
  marketer: "Маркетолог",
  influencer: "Блогер",
};

export default function Sidebar({
  role,
  name,
}: {
  role: Role;
  name: string;
}) {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-600/60 bg-ink-800">
      <div className="border-b border-ink-600/60 px-6 py-5">
        <span className="font-serif text-2xl font-semibold tracking-[0.15em] text-gold-gradient">
          DOZA
        </span>
        <p className="text-[10px] uppercase tracking-[0.25em] text-ivory-faint">
          CRM
        </p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-gold-500/10 text-gold-300"
                  : "text-ivory-muted hover:bg-ink-700 hover:text-ivory"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-600/60 p-4">
        <p className="text-sm text-ivory">{name}</p>
        <p className="mb-3 text-xs text-ivory-faint">{ROLE_LABEL[role]}</p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-600/60 hover:text-gold-400"
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}
