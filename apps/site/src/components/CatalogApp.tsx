import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import type { ProductCard, Gender } from "../lib/types";
import { GENDER_LABELS } from "../lib/types";

interface Props {
  products: ProductCard[];
  brands: string[];
  initialGender?: Gender | "";
  initialQuery?: string;
  initialBrands?: string[];
  initialBoosted?: boolean;
}

const GENDERS: { value: Gender | ""; label: string }[] = [
  { value: "", label: "Все" },
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
  { value: "unisex", label: "Унисекс" },
];

function formatByn(amount: number): string {
  return `${amount.toFixed(2)} BYN`;
}

export default function CatalogApp({
  products,
  brands,
  initialGender = "",
  initialQuery = "",
  initialBrands = [],
  initialBoosted = false,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [gender, setGender] = useState<Gender | "">(initialGender);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(initialBrands);
  const [onlyBoosted, setOnlyBoosted] = useState(initialBoosted);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Синхронизация фильтров в URL — чтобы «назад» возвращал к отфильтрованному каталогу
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (gender) params.set("gender", gender);
    if (selectedBrands.length) params.set("brands", selectedBrands.join(","));
    if (onlyBoosted) params.set("boosted", "1");
    const qs = params.toString();
    const newUrl = qs ? `/catalog?${qs}` : "/catalog";
    window.history.replaceState(null, "", newUrl);
  }, [query, gender, selectedBrands, onlyBoosted]);

  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ["name", "brand"],
        threshold: 0.4, // терпимость к опечаткам
        ignoreLocation: true,
      }),
    [products],
  );

  const filtered = useMemo(() => {
    let list = query.trim()
      ? fuse.search(query.trim()).map((r) => r.item)
      : products;

    if (gender) list = list.filter((p) => p.gender === gender);
    if (selectedBrands.length) {
      const set = new Set(selectedBrands);
      list = list.filter((p) => set.has(p.brand));
    }
    if (onlyBoosted) list = list.filter((p) => p.cashbackBoosted);
    return list;
  }, [query, gender, selectedBrands, onlyBoosted, products, fuse]);

  function toggleBrand(brand: string) {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );
  }

  function resetFilters() {
    setGender("");
    setSelectedBrands([]);
    setOnlyBoosted(false);
  }

  const activeCount =
    (gender ? 1 : 0) + selectedBrands.length + (onlyBoosted ? 1 : 0);
  const hasFilters = query || activeCount > 0;

  // ── Поиск (общий для десктопа и мобильного) ──────────────────────────────
  const searchField = (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Название или бренд…"
        className="h-11 w-full rounded-full border border-ink-600 bg-ink-700 pl-10 pr-4 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
      />
      <svg
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory-faint"
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </div>
  );

  // ── Контролы фильтров (пол + бренды) — переиспользуются ───────────────────
  const filterControls = (
    <>
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-luxe text-gold-500">
          Для кого
        </h3>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <button
              key={g.value || "all"}
              onClick={() => setGender(g.value)}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors duration-200 ${
                gender === g.value
                  ? "border-gold-500 bg-gold-500/10 text-gold-300"
                  : "border-ink-600 text-ivory-muted hover:border-gold-600/60 hover:text-gold-400"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-luxe text-gold-500">
          Бренд
        </h3>
        <ul className="space-y-2">
          {brands.map((brand) => (
            <li key={brand}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ivory-muted transition-colors hover:text-ivory">
                <input
                  type="checkbox"
                  checked={selectedBrands.includes(brand)}
                  onChange={() => toggleBrand(brand)}
                  className="peer sr-only"
                />
                <span className="flex h-4 w-4 items-center justify-center rounded border border-ink-600 transition-colors peer-checked:border-gold-500 peer-checked:bg-gold-500">
                  <svg
                    className="h-3 w-3 text-ink-900 opacity-0 transition-opacity peer-checked:opacity-100"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                {brand}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-luxe text-gold-500">
          Кешбэк
        </h3>
        <button
          onClick={() => setOnlyBoosted((v) => !v)}
          className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
            onlyBoosted
              ? "border-gold-500 bg-gold-500/10 text-gold-300"
              : "border-ink-600 text-ivory-muted hover:border-gold-600/60"
          }`}
        >
          <span>Повышенный кешбэк</span>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              onlyBoosted ? "bg-gold-500" : "bg-ink-600"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink-900 transition-transform ${
                onlyBoosted ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      {activeCount > 0 && (
        <button
          onClick={resetFilters}
          className="cursor-pointer text-sm font-light text-ivory-faint underline-offset-4 transition-colors hover:text-gold-400 hover:underline"
        >
          Сбросить фильтры
        </button>
      )}
    </>
  );

  // ── Карточка товара ───────────────────────────────────────────────────────
  const card = (p: ProductCard) => {
    const disc = p.discountPercent > 0 ? p.discountPercent : 0;
    const finalFrom =
      disc > 0
        ? Math.round(p.priceFrom * (1 - disc / 100) * 100) / 100
        : p.priceFrom;
    return (
      <a
        key={p.id}
        href={`/product/${p.slug}`}
        className="group relative block overflow-hidden rounded-xl border border-ink-600/60 bg-ink-700 transition-all duration-300 hover:border-gold-500/70 hover:shadow-gold"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-ink-900">
          <img
            src={p.image}
            alt={`${p.brand} ${p.name}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink-700/90 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full border border-gold-500/30 bg-ink-900/70 px-2.5 py-1 text-[11px] font-light text-gold-400 backdrop-blur-sm">
            {GENDER_LABELS[p.gender]}
          </span>
          {disc > 0 && (
            <span className="absolute left-3 top-11 rounded-full bg-botanical-500 px-2.5 py-1 text-[11px] font-semibold text-ink-900">
              −{disc}%
            </span>
          )}
          {p.cashbackBoosted && (
            <span className="absolute right-3 top-3 rounded-full bg-gold-gradient px-2.5 py-1 text-[11px] font-semibold text-ink-900 shadow-gold">
              Вернём {p.cashbackPercent}% баллами
            </span>
          )}
        </div>
        <div className="space-y-2 p-4 sm:p-5">
          <div className="text-[11px] font-medium uppercase tracking-luxe text-gold-500">
            {p.brand}
          </div>
          <h3 className="font-serif text-lg leading-tight text-ivory sm:text-xl">
            {p.name}
          </h3>
          <div className="pt-1">
            <span className="text-base font-medium text-gold-400">
              {disc > 0 ? (
                <>
                  <span className="mr-1.5 text-sm font-light text-ivory-faint line-through">
                    {p.priceFrom.toFixed(2)}
                  </span>
                  от {formatByn(finalFrom)}
                </>
              ) : (
                <>от {formatByn(p.priceFrom)}</>
              )}
            </span>
          </div>
        </div>
      </a>
    );
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      {/* ── Десктоп: сайдбар ── */}
      <aside className="hidden space-y-8 lg:sticky lg:top-24 lg:block lg:self-start">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-luxe text-gold-500">
            Поиск
          </h3>
          {searchField}
        </div>
        {filterControls}
      </aside>

      {/* ── Контент ── */}
      <div>
        {/* Мобильная панель: поиск + кнопка «Фильтры» */}
        <div className="mb-4 lg:hidden">
          <div className="flex gap-2">
            <div className="flex-1">{searchField}</div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-gold-600/50 px-4 text-sm text-gold-400"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="10" y1="18" x2="14" y2="18" />
              </svg>
              Фильтры
              {activeCount > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold-gradient px-1.5 text-xs font-semibold text-ink-900">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <p className="mb-5 text-sm font-light text-ivory-faint">
          Найдено: {filtered.length}
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-ink-600/60 bg-ink-700 p-12 text-center text-ivory-muted">
            Ничего не найдено. Попробуйте изменить запрос или фильтры.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
            {filtered.map(card)}
          </div>
        )}
      </div>

      {/* ── Мобильный drawer фильтров ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* затемнение */}
          <button
            aria-label="Закрыть фильтры"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-900/70 backdrop-blur-sm"
          />
          {/* панель */}
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-ink-600/60 bg-ink-800">
            <div className="flex items-center justify-between border-b border-ink-600/60 px-5 py-4">
              <span className="font-serif text-xl text-ivory">Фильтры</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-ivory-faint hover:text-gold-400"
                aria-label="Закрыть"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto p-5">
              {filterControls}
            </div>

            <div className="border-t border-ink-600/60 p-4">
              <button
                onClick={() => setDrawerOpen(false)}
                className="h-12 w-full rounded-full bg-gold-gradient text-base font-medium text-ink-900"
              >
                Показать {filtered.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
