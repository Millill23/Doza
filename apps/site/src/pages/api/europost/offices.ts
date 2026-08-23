import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { distanceKm } from "@doza/shared/geo";

export const prerender = false;

/** Сколько отделений отдаём за раз: столько влезает в список без тормозов. */
const LIMIT = 200;

/**
 * Отделения Европочты для выбора при оформлении.
 *
 * Отдаём из своего справочника, а не запросом к Европочте на каждый заход:
 * их API требует ключа и может лежать, а покупатель в этот момент оформляет
 * заказ. Справочник наполняется отдельно — вручную в CRM либо фоновой
 * выгрузкой, когда появится доступ.
 *
 * Если покупатель разрешил геолокацию, режем список по расстоянию, а не по
 * алфавиту: отделений больше, чем помещается в ответ, и алфавитная обрезка
 * выкидывала соседний филиал, оставляя «ближайшим» тот, что за полсотни
 * километров.
 */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const here =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  const found = await prisma.europostOffice.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { city: { contains: q, mode: "insensitive" as const } },
              { address: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ city: "asc" }, { address: "asc" }],
    // Без координат режем сразу в базе; с координатами берём весь справочник —
    // он на сотни строк, отсортировать его в памяти дешевле, чем ошибиться.
    ...(here ? {} : { take: LIMIT }),
    select: {
      code: true,
      city: true,
      address: true,
      workingHours: true,
      latitude: true,
      longitude: true,
    },
  });

  const offices = found.map((o) => ({
    code: o.code,
    city: o.city,
    address: o.address,
    workingHours: o.workingHours,
    lat: o.latitude != null ? Number(o.latitude) : null,
    lng: o.longitude != null ? Number(o.longitude) : null,
  }));

  if (here) {
    // Отделения без координат уходят в конец, но не пропадают: их всё ещё
    // можно найти поиском по городу.
    offices.sort(
      (a, b) =>
        (a.lat != null && a.lng != null
          ? distanceKm(here, { lat: a.lat, lng: a.lng })
          : Infinity) -
        (b.lat != null && b.lng != null
          ? distanceKm(here, { lat: b.lat, lng: b.lng })
          : Infinity),
    );
    offices.length = Math.min(offices.length, LIMIT);
  }

  return new Response(
    JSON.stringify({ ok: true, offices }),
    { headers: { "Content-Type": "application/json" } },
  );
};
