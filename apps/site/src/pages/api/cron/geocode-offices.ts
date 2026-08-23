import type { APIRoute } from "astro";
import { prisma } from "@doza/db";

export const prerender = false;

/**
 * Ежедневно дописывать координаты отделениям, у которых их нет.
 *
 * Сам справочник отделений сюда не тянется: сайт Европочты отвечает серверу
 * 403 и требует пройти браузерную проверку, поэтому список номеров и адресов
 * лежит в репозитории и обновляется вместе с кодом. А вот координаты можно
 * получать свободно — геокодером OpenStreetMap.
 *
 * Обычно работы нет: у всех отделений координаты уже проставлены. Задача
 * оживает, когда в справочник добавили новое отделение, — и размечает его в
 * ближайшие сутки.
 *
 * Nominatim просит не чаще запроса в секунду и требует представляться. Отсюда
 * пауза и потолок на запуск: даже если размечать нужно всё, мы растянем это на
 * несколько дней, а не устроим чужому бесплатному сервису нашествие.
 */
const UA = "DOZA-parfum-shop/1.0 (https://doza-parfum.by; aclassaliance@gmail.com)";
const PAUSE_MS = 1200;
const MAX_PER_RUN = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** «г. Новополоцк, ул. Еронько, 7а» → запросы от точного к общему. */
function queries(address: string): string[] {
  const clean = address.replace(/\s*\([^)]*\)/g, "").trim();
  const parts = clean.split(",").map((s) => s.trim());
  const city = parts[0].replace(/^(г\.|аг\.|гп\.|пгт\.|п\.|д\.)\s*/i, "").trim();
  const street = (parts[1] ?? "")
    .replace(/^(ул\.|пр-т\.|пр-т|пр\.|б-р\.|пер\.|ш\.|тр-т\.|мкр\.|пл\.|пр-д)\s*/i, "")
    .trim();
  const house = ((parts[2] ?? "").match(/^\d+[а-яa-z]?/i) ?? [""])[0];

  return [
    house && street ? `${city}, ${street} ${house}` : "",
    street ? `${city}, ${street}` : "",
    city,
  ].filter(Boolean);
}

export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[geocode] CRON_SECRET не задан — задача не выполняется");
    return json({ ok: false, error: "CRON_SECRET не задан на сервере" }, 500);
  }
  if (new URL(request.url).searchParams.get("key") !== secret) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const todo = await prisma.europostOffice.findMany({
    where: { isActive: true, latitude: null },
    take: MAX_PER_RUN,
    orderBy: { code: "asc" },
  });

  if (todo.length === 0) return json({ ok: true, pending: 0, geocoded: 0 });

  let geocoded = 0;
  const failed: string[] = [];

  for (const office of todo) {
    let found: { lat: number; lng: number } | null = null;

    for (const q of queries(office.address)) {
      try {
        const res = await fetch(
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=by&q=" +
            encodeURIComponent(q),
          { headers: { "User-Agent": UA } },
        );
        if (res.ok) {
          const data = (await res.json()) as { lat: string; lon: string }[];
          if (data[0]) found = { lat: Number(data[0].lat), lng: Number(data[0].lon) };
        }
      } catch (e) {
        console.error(`[geocode] сбой запроса для «${q}»:`, e);
      }
      await sleep(PAUSE_MS);
      if (found) break;
    }

    if (found) {
      await prisma.europostOffice.update({
        where: { id: office.id },
        data: { latitude: found.lat, longitude: found.lng },
      });
      geocoded++;
    } else {
      // Не нашли — отделение всё равно доступно для выбора, просто без
      // булавки. Завтра попробуем ещё раз.
      failed.push(`№${office.code} ${office.address}`);
    }
  }

  const left = await prisma.europostOffice.count({
    where: { isActive: true, latitude: null },
  });

  if (failed.length > 0) {
    console.warn(`[geocode] не найдены (${failed.length}):\n  ${failed.join("\n  ")}`);
  }

  return json({ ok: true, geocoded, failed: failed.length, pending: left });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
