import { useEffect, useRef } from "react";
import type { Office } from "./OfficePicker";

/**
 * Карта отделений Европочты.
 *
 * Leaflet с тайлами OpenStreetMap: ключ не нужен, лимитов нет, лицензия
 * позволяет коммерческое использование при указании авторства — оно в углу
 * карты и стоит там не для красоты.
 *
 * Карта здесь — не единственный способ выбрать отделение, а дополнение к
 * списку: у отделения может не быть координат, интернет бывает медленным, а
 * человек с телефона чаще ищет знакомый адрес, чем возит карту пальцем.
 */

/** Иконка-булавка рисуется css-ом: возить картинки ради точки незачем. */
const PIN_STYLE = `
.doza-pin {
  width: 26px; height: 26px;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  border: 2px solid #0e0d0a;
  background: linear-gradient(135deg, #d9b775, #b8935a);
  box-shadow: 0 2px 6px rgba(0,0,0,.5);
}
.doza-pin.is-selected { background: #f5f1e8; }
.leaflet-container { background: #14120f; font: inherit; }
.leaflet-popup-content-wrapper, .leaflet-popup-tip {
  background: #1c1a16; color: #f5f1e8; border: 1px solid #3a352c;
}
.leaflet-popup-content { margin: 10px 12px; font-size: 13px; }
.leaflet-control-attribution { background: rgba(20,18,15,.8) !important; color: #8a8478 !important; }
.leaflet-control-attribution a { color: #b8935a !important; }
`;

export default function OfficeMap({
  offices,
  selectedCode,
  onSelect,
}: {
  offices: Office[];
  selectedCode: string | null;
  onSelect: (o: Office) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  // Обработчик держим в ref: пересоздавать карту ради нового колбэка — значит
  // терять положение и масштаб, которые покупатель только что выставил.
  const pick = useRef(onSelect);
  pick.current = onSelect;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Leaflet грузим динамически: он весит немало, а нужен только тем, кто
      // открыл карту, — на страницу корзины его тащить незачем.
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !box.current || map.current) return;

      if (!document.getElementById("doza-map-style")) {
        const style = document.createElement("style");
        style.id = "doza-map-style";
        style.textContent = PIN_STYLE;
        document.head.appendChild(style);
      }

      // Центр — географический центр Беларуси: пока не знаем, где покупатель,
      // показываем страну целиком.
      map.current = L.map(box.current, { attributionControl: true }).setView(
        [53.7, 27.95],
        6,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);

      draw(L);
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Перерисовываем точки при смене результатов поиска.
  useEffect(() => {
    if (!map.current) return;
    import("leaflet").then(({ default: L }) => draw(L));
  }, [offices, selectedCode]);

  function draw(L: any) {
    if (!layer.current) return;
    layer.current.clearLayers();

    const withCoords = offices.filter((o) => o.lat != null && o.lng != null);
    for (const o of withCoords) {
      const selected = o.code === selectedCode;
      const marker = L.marker([o.lat, o.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="doza-pin${selected ? " is-selected" : ""}"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        }),
        title: `Отделение №${o.code}`,
      });
      marker.bindPopup(
        `<b>Отделение №${o.code}</b><br>${escapeHtml(o.address)}` +
          (o.workingHours ? `<br><span style="opacity:.7">${escapeHtml(o.workingHours)}</span>` : "") +
          `<br><button type="button" data-code="${o.code}" class="doza-pick" style="margin-top:6px;cursor:pointer;background:#b8935a;color:#0e0d0a;border:0;border-radius:6px;padding:6px 10px;font:inherit;font-size:12px">Выбрать это отделение</button>`,
      );
      marker.addTo(layer.current);
    }

    // Подгоняем масштаб под найденное — иначе после поиска по городу
    // покупатель видит всю страну и ищет свою точку глазами.
    if (withCoords.length > 0) {
      const bounds = L.latLngBounds(withCoords.map((o) => [o.lat, o.lng]));
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }

  // Кнопка живёт внутри попапа Leaflet, поэтому слушаем всплытие на контейнере.
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
