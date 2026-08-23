import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Office } from "./OfficePicker";

/**
 * Карта отделений Европочты на MapLibre GL.
 *
 * Стиль и тайлы — OpenFreeMap: векторные, без ключа и лимитов, разрешены к
 * коммерческому использованию. Авторство OpenStreetMap MapLibre показывает сам
 * и стоит там не для красоты.
 *
 * При открытии карта просит геолокацию и подъезжает к покупателю: почти всегда
 * ему нужно отделение рядом с домом, а не обзор страны. Отказ в доступе —
 * штатный случай: тогда показываем все найденные отделения целиком.
 *
 * Версия MapLibre держится на ветке 5.x осознанно: на 6.5.0 фоновый воркер не
 * отвечал на запросы стиля, карта оставалась пустым холстом без единого тайла.
 * Обновлять — только проверив, что отделения рисуются.
 */

const STYLE = "https://tiles.openfreemap.org/styles/positron";

/** Центр Беларуси — пока не знаем, где покупатель. */
const CENTER: [number, number] = [27.95, 53.7];

const PIN_STYLE = `
.doza-pin {
  width: 24px; height: 24px; cursor: pointer;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  border: 2px solid #0e0d0a;
  background: linear-gradient(135deg, #d9b775, #b8935a);
  box-shadow: 0 2px 6px rgba(0,0,0,.45);
}
.doza-pin:hover, .doza-pin.is-selected { background: #f5f1e8; }
.maplibregl-popup-content {
  background: #1c1a16; color: #f5f1e8;
  border: 1px solid #3a352c; border-radius: 10px;
  padding: 10px 12px; font-size: 13px; font: inherit; font-size: 13px;
}
.maplibregl-popup-tip { border-top-color: #1c1a16 !important; border-bottom-color: #1c1a16 !important; }
.maplibregl-popup-close-button { color: #8a8478; font-size: 18px; padding: 0 6px; }
.maplibregl-ctrl-attrib { font-size: 10px; }
`;

export default function OfficeMap({
  offices,
  selectedCode,
  onSelect,
  onLocate,
}: {
  offices: Office[];
  selectedCode: string | null;
  onSelect: (o: Office) => void;
  /** Координаты покупателя, когда он разрешил геолокацию. */
  onLocate?: (coords: { lat: number; lng: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<any[]>([]);

  /** Покупатель уже нашёлся — больше не подгоняем карту под список. */
  const located = useRef(false);
  const [failed, setFailed] = useState(false);
  // Готовность — состояние, а не ref: пока карта грузится, список отделений
  // успевает прийти, и React должен перерисовать булавки, когда она готова.
  const [ready, setReady] = useState(false);

  // Колбэки держим в ref: пересоздавать карту ради нового замыкания значит
  // терять масштаб и положение, которые покупатель только что выставил.
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const locate = useRef(onLocate);
  locate.current = onLocate;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
      // MapLibre грузим динамически: он весит немало, а нужен только тем, кто
      // открыл выбор отделения.
      // У MapLibre именованные экспорты, а не default: берём весь модуль.
      const maplibre = await import("maplibre-gl");
      if (cancelled || !box.current || map.current) return;

      if (!document.getElementById("doza-map-style")) {
        const style = document.createElement("style");
        style.id = "doza-map-style";
        style.textContent = PIN_STYLE;
        document.head.appendChild(style);
      }

      const m = new maplibre.Map({
        container: box.current,
        style: STYLE,
        center: CENTER,
        zoom: 5.6,
        attributionControl: { compact: true },
      });
      map.current = m;

      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");

      const geolocate = new maplibre.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: true,
        fitBoundsOptions: { maxZoom: 13 },
      });
      m.addControl(geolocate, "top-right");

      geolocate.on("geolocate", (e: any) => {
        located.current = true;
        locate.current?.({ lat: e.coords.latitude, lng: e.coords.longitude });
      });
      // Отказ в геолокации — не ошибка: молча показываем всё, что нашли.
      geolocate.on("error", () => {
        located.current = false;
        fit();
      });

      m.on("load", () => {
        setReady(true);
        // Спрашиваем разрешение сразу: покупатель нажал «выбрать отделение»,
        // это и есть его согласие на то, чтобы ему помогли найти ближайшее.
        // trigger() возвращает false, когда геолокация недоступна или запрещена
        // раньше — тогда сразу показываем всю страну, а не ждём события.
        let asked = false;
        try {
          asked = geolocate.trigger();
        } catch {
          asked = false;
        }
        if (!asked) fit();
      });
      } catch (e) {
        // Карта — не единственный способ выбрать отделение, поэтому её сбой не
        // должен выглядеть как поломка всей страницы. Но и молчать нельзя:
        // пустой прямоугольник вместо карты покупатель воспримет как поломку.
        console.error("[map] карта не загрузилась:", e);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    import("maplibre-gl").then((maplibre) => draw(maplibre));
  }, [offices, selectedCode, ready]);

  function fit() {
    const m = map.current;
    const pts = offices.filter((o) => o.lat != null && o.lng != null);
    if (!m || pts.length === 0) return;

    let [w, s, e, n] = [180, 90, -180, -90];
    for (const o of pts) {
      w = Math.min(w, o.lng!);
      e = Math.max(e, o.lng!);
      s = Math.min(s, o.lat!);
      n = Math.max(n, o.lat!);
    }
    m.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 40, maxZoom: 14, duration: 400 },
    );
  }

  function draw(maplibre: any) {
    const m = map.current;
    if (!m) return;

    for (const mk of markers.current) mk.remove();
    markers.current = [];

    for (const o of offices) {
      if (o.lat == null || o.lng == null) continue;

      const el = document.createElement("div");
      el.className = `doza-pin${o.code === selectedCode ? " is-selected" : ""}`;
      el.title = `Отделение №${o.code}`;

      const popup = new maplibre.Popup({ offset: 26, closeButton: true }).setHTML(
        `<b>Отделение №${o.code}</b><br>${escapeHtml(o.address)}` +
          (o.workingHours
            ? `<br><span style="opacity:.7">${escapeHtml(o.workingHours)}</span>`
            : "") +
          `<br><button type="button" data-code="${o.code}" class="doza-pick" style="margin-top:8px;cursor:pointer;background:#b8935a;color:#0e0d0a;border:0;border-radius:6px;padding:7px 11px;font:inherit;font-size:12px">Выбрать это отделение</button>`,
      );

      markers.current.push(
        new maplibre.Marker({ element: el, anchor: "bottom" })
          .setLngLat([o.lng, o.lat])
          .setPopup(popup)
          .addTo(m),
      );
    }

    // Подгоняем масштаб под найденное, только пока не знаем, где покупатель:
    // иначе поиск по городу отбрасывал бы карту от его дома.
    if (!located.current) fit();
  }

  // Кнопка живёт внутри попапа, поэтому слушаем всплытие на контейнере.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".doza-pick");
      if (!target) return;
      const code = target.getAttribute("data-code");
      const office = offices.find((o) => o.code === code);
      if (office) pick.current(office);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [offices]);

  const missing = offices.filter((o) => o.lat == null).length;

  if (failed) {
    return (
      <p className="rounded-lg border border-ink-600 bg-ink-800/60 p-3 text-center text-xs text-ivory-faint">
        Карта не загрузилась — выберите отделение из списка ниже.
      </p>
    );
  }

  return (
    <div>
      <div
        ref={box}
        className="h-64 w-full overflow-hidden rounded-lg border border-ink-600"
        role="application"
        aria-label="Карта отделений Европочты"
      />
      {missing > 0 && (
        <p className="mt-1 text-[11px] text-ivory-faint">
          {missing} из {offices.length} отделений пока без точки на карте — их
          видно в списке ниже.
        </p>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}
