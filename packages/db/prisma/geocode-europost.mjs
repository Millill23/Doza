import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  officeQueries,
  precisionOf,
} from "../../shared/src/europost-address.ts";

/**
 * Проставить координаты отделениям Европочты.
 *
 * Геокодер — Nominatim (OpenStreetMap): бесплатный, без ключа, но с жёстким
 * правилом «не чаще запроса в секунду» и требованием представляться в
 * User-Agent. Поэтому пауза между запросами и никакой параллельности.
 *
 * Координаты сохраняем, только если геокодер нашёл дом или улицу. Ответ уровня
 * «город» отбрасываем: он выглядит как обычная точка, но означает «улицу найти
 * не удалось, вот вам центр». Однажды так пять минских отделений получили одну
 * точку на всех, и отделение в Копище оказалось на карте в двенадцати
 * километрах от себя — покупатель, живущий рядом, его попросту не нашёл.
 * Отсутствие булавки честнее: отделение остаётся в списке, просто без
 * расстояния.
 *
 * Результат пишется обратно в `europost-offices.json`, чтобы координаты ехали
 * вместе с репозиторием: геокодировать одно и то же на каждом сервере — значит
 * без нужды долбить чужой бесплатный сервис.
 *
 * Строка отделения: `[код, адрес, широта, долгота, точность]`. Пятое поле
 * означает «уже пробовали»: без него скрипт каждый раз заново спрашивал бы про
 * ненаходимые адреса. `--force` переразмечает всё заново.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "europost-offices.json");
const FORCE = process.argv.includes("--force");

const UA = "DOZA-parfum-shop/1.0 (https://doza-parfum.by; aclassaliance@gmail.com)";
const PAUSE_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lookup(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=by&q=" +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json[0]) return null;
  return {
    lat: Number(json[0].lat),
    lng: Number(json[0].lon),
    precision: precisionOf(json[0].addresstype),
  };
}

/**
 * Ищем от точного к общему и берём первый ответ про дом или улицу.
 *
 * Решает тип найденного объекта, а не текст запроса: на дом в несуществующей
 * улице Nominatim охотно возвращает город целиком.
 */
async function geocode(address) {
  for (const { q } of officeQueries(address)) {
    const found = await lookup(q);
    await sleep(PAUSE_MS);
    if (found && found.precision !== "locality") return found;
  }
  return null;
}

async function main() {
  const rows = JSON.parse(readFileSync(FILE, "utf8"));
  const todo = rows.filter((r) => FORCE || r.length < 5);
  console.log(`🗺️  Геокодирование: ${todo.length} из ${rows.length}`);

  let done = 0;
  let vague = 0;
  let processed = 0;

  for (const row of rows) {
    if (!FORCE && row.length >= 5) continue;
    const found = await geocode(row[1]);
    processed++;

    if (found) {
      row[2] = Number(found.lat.toFixed(6));
      row[3] = Number(found.lng.toFixed(6));
      row[4] = found.precision;
      done++;
    } else {
      // Точки не будет, но отделение остаётся доступным для выбора.
      row[2] = null;
      row[3] = null;
      row[4] = "locality";
      vague++;
      console.log(`   без точки: ${row[1]}`);
    }

    if (processed % 25 === 0) {
      console.log(`   ... ${processed}/${todo.length}`);
      // Пишем по ходу дела: обрыв на середине не должен стоить всей работы.
      writeFileSync(FILE, format(rows));
    }
  }

  writeFileSync(FILE, format(rows));
  console.log(`✅ С точкой: ${done}, без точки: ${vague}`);
}

/** Одно отделение — одна строка: так файл читаемо диффится. */
function format(rows) {
  return "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n";
}

// Запускаем только при прямом вызове. Без этой проверки простой импорт ради
// одной функции поднимает второй геокодер: он молотит чужой бесплатный сервис
// вдвое чаще дозволенного и пишет в тот же файл, что и первый.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
