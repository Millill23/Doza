"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef } from "react";

type Role = "admin" | "seller" | "marketer" | "influencer";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "Дашборд", roles: ["admin", "seller", "marketer"] },
  // Блогер видит ровно один раздел: свои продажи. Ни дашборда, ни клиентов –
  // это чужие персональные данные, и ему они ни к чему.
  { href: "/my-sales", label: "Продажи", roles: ["influencer"] },
  { href: "/orders", label: "Заказы", roles: ["admin", "seller"] },
  { href: "/cash", label: "Оффлайн-касса", roles: ["admin", "seller"] },
  { href: "/preorders", label: "Предзаказы", roles: ["admin", "seller"] },
  { href: "/certificates", label: "Сертификаты", roles: ["admin", "seller"] },
  { href: "/products", label: "Товары", roles: ["admin"] },
  { href: "/stock", label: "Остатки", roles: ["seller"] },
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
  { href: "/tests", label: "Тесты", roles: ["admin"] },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  seller: "Продавец",
  marketer: "Маркетолог",
  influencer: "Блогер",
};

const MENU_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-ink-600 text-gold-300 hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400";

export default function Sidebar({
  role,
  name,
}: {
  role: Role;
  name: string;
}) {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.roles.includes(role));
  const menu = useRef<HTMLDialogElement>(null);
  const closeMenu = () => menu.current?.close();

  useEffect(() => {
    menu.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) menu.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const brand = (
    <div>
      <span className="font-serif text-2xl font-semibold tracking-[0.15em] text-gold-gradient">
        DOZA
      </span>
      <p className="text-[10px] uppercase tracking-[0.25em] text-ivory-faint">
        CRM
      </p>
    </div>
  );

  const navigation = (
    <>
      <nav aria-label="Разделы CRM" className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={closeMenu}
              className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 lg:min-h-0 ${
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
          className="min-h-11 w-full rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-600/60 hover:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 lg:min-h-0"
        >
          Выйти
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-600/60 bg-ink-800 lg:flex">
        <div className="border-b border-ink-600/60 px-6 py-5">{brand}</div>
        {navigation}
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-600/60 bg-ink-800 px-4 py-2 lg:hidden">
        <button
          type="button"
          aria-label="Открыть меню CRM"
          aria-haspopup="dialog"
          aria-controls="crm-mobile-menu"
          className={MENU_BUTTON}
          onClick={() => menu.current?.showModal()}
        >
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-serif text-xl tracking-[0.12em] text-gold-300">DOZA CRM</span>
      </header>

      <dialog
        ref={menu}
        id="crm-mobile-menu"
        aria-label="Меню CRM"
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-72 max-w-[calc(100%_-_3rem)] overflow-y-auto overscroll-contain border-r border-ink-600 bg-ink-800 p-0 text-ivory backdrop:bg-black/60"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div className="flex min-h-full flex-col">
          <div className="sticky top-0 flex items-center justify-between border-b border-ink-600/60 bg-ink-800 px-4 py-3">
            {brand}
            <button type="button" autoFocus aria-label="Закрыть меню CRM" className={MENU_BUTTON} onClick={closeMenu}>
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          </div>
          {navigation}
        </div>
      </dialog>
    </>
  );
}
