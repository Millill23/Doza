import { useEffect, useState } from "react";
import OfficeMap from "./OfficeMap";
import { distanceKm, formatDistance } from "@doza/shared/geo";

/**
 * Выбор отделения Европочты.
 *
 * Список, а не карта: покупатель обычно знает, к какому отделению ходит, и
 * найти его поиском по адресу быстрее, чем возить карту пальцем. Карта тут
 * станет слоем поверх — координаты у отделений уже хранятся, — но список
 * останется основным способом: он работает на любом устройстве и не зависит
 * от чужого сервиса.
 */

export interface Office {
  code: string;
  city: string;
  address: string;
  workingHours: string | null;
  lat: number | null;
  lng: number | null;
}

export default function OfficePicker({
  selected,
  onSelect,
}: {
  selected: Office | null;
  onSelect: (o: Office | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(false);
  /** Где покупатель, если разрешил геолокацию. */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  // Когда знаем, где человек, ближайшие отделения идут первыми — иначе от
  // геолокации толк только на карте, а в списке по-прежнему алфавит.
  const sorted = here
    ? [...offices]
        .map((o) => ({
          o,
          km: o.lat != null && o.lng != null
            ? distanceKm(here, { lat: o.lat, lng: o.lng })
            : Infinity,
        }))
        .sort((a, b) => a.km - b.km)
    : offices.map((o) => ({ o, km: Infinity }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        // Координаты округляем до сотых — это около километра, для сортировки
        // отделений хватает с запасом, а точное местоположение покупателя не
        // оседает в журналах сервера.
        const around = here
          ? `&lat=${here.lat.toFixed(2)}&lng=${here.lng.toFixed(2)}`
          : "";
        const r = await fetch(
          `/api/europost/offices?q=${encodeURIComponent(query.trim())}${around}`,
        );
        const data = await r.json();
        if (!cancelled) setOffices(data.offices ?? []);
      } catch {
        if (!cancelled) setOffices([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, here]);

  if (selected) {
    return (
      <div className="rounded-lg border border-botanical-500/40 bg-botanical-500/5 p-3">
        <p className="text-sm text-ivory">
          Отделение №{selected.code}
        </p>
        <p className="mt-0.5 text-xs text-ivory-muted">
          {selected.address}
        </p>
        {selected.workingHours && (
          <p className="mt-0.5 text-[11px] text-ivory-faint">
            {selected.workingHours}
          </p>
        )}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mt-2 cursor-pointer text-xs text-gold-400 hover:text-gold-300"
        >
          Выбрать другое
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full cursor-pointer rounded-lg border border-gold-600/50 px-4 text-sm text-gold-400 transition-colors hover:bg-gold-500/10"
      >
        Выбрать отделение
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/60 p-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Город, улица или номер отделения"
        autoFocus
        className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
      />

      {/* Карта и список показывают одно и то же и работают вместе: поиск сужает
          оба, выбрать можно и булавкой, и строкой. */}
      {offices.length > 0 && (
        <div className="mt-2">
          <OfficeMap
            offices={offices}
            selectedCode={null}
            onLocate={setHere}
            onSelect={(o) => {
              onSelect(o);
              setOpen(false);
            }}
          />
        </div>
      )}

      <div className="mt-2 max-h-64 overflow-y-auto">
        {loading && (
          <p className="py-3 text-center text-xs text-ivory-faint">Ищем…</p>
        )}

        {!loading && offices.length === 0 && (
          <p className="py-3 text-center text-xs leading-relaxed text-ivory-faint">
            {query.trim()
              ? "Ничего не нашлось — попробуйте другой город или улицу."
              : "Список отделений пока пуст. Выберите Белпочту или самовывоз, либо напишите нам — подскажем."}
          </p>
        )}

        {here && (
          <p className="pb-1 text-[11px] text-botanical-300">
            Ближайшие к вам — сверху
          </p>
        )}

        <ul className="space-y-1">
          {sorted.map(({ o, km }) => (
            <li key={o.code}>
              <button
                type="button"
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                }}
                className="w-full cursor-pointer rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-gold-600/50 hover:bg-gold-500/5"
              >
                <span className="flex items-baseline justify-between gap-2 text-sm text-ivory">
                  <span>Отделение №{o.code}</span>
                  {Number.isFinite(km) && (
                    <span className="shrink-0 text-xs text-botanical-300">
                      {formatDistance(km)}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-ivory-muted">{o.address}</span>
                {o.workingHours && (
                  <span className="block text-[11px] text-ivory-faint">
                    {o.workingHours}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 cursor-pointer text-xs text-ivory-faint hover:text-gold-400"
      >
        Отмена
      </button>
    </div>
  );
}
