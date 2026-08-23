import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Проставить координаты отделениям Европочты.
 *
 * Геокодер — Nominatim (OpenStreetMap): бесплатный, без ключа, но с жёстким
 * правилом «не чаще запроса в секунду» и требованием представляться в
 * User-Agent. Поэтому пауза между запросами и никакой параллельности.
 *
 * Результат пишется обратно в `europost-offices.json`, чтобы координаты ехали
 * вместе с репозиторием: геокодировать одно и то же на каждом сервере — значит
 * без нужды долбить чужой бесплатный сервис.
 *
 * Скрипт идемпотентен: уже размеченные отделения пропускаются. `--force`
 * переразмечает всё заново.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "europost-offices.json");
const FORCE = process.argv.includes("--force");

const UA = "DOZA-parfum-shop/1.0 (https://doza-parfum.by; aclassaliance@gmail.com)";
const PAUSE_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** «г. Новополоцк, ул. Еронько, 7а» → { city, street, house }. */
export function parseAddress(raw) {
  const noBrackets = raw.replace(/\s*\([^)]*\)/g, "").trim();
  const parts = noBrackets.split(",").map((s) => s.trim());

  const city = parts[0].replace(/^(г\.|аг\.|гп\.|пгт\.|п\.|д\.)\s*/i, "").trim();
  const street = (parts[1] ?? "")
    .replace(/^(ул\.|пр-т\.|пр-т|пр\.|б-р\.|пер\.|ш\.|тр-т\.|мкр\.|пл\.|пр-д)\s*/i, "")
    .trim();

  // Номер дома: первая группа цифр. Хвост после дефиса — это квартира или
  // помещение, геокодеру он только мешает.
  const houseRaw = (parts[2] ?? "").trim();
  const house = (houseRaw.match(/^\d+[а-яa-z]?/i) ?? [""])[0];

  return { city, street, house };
}

async function lookup(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=by&q=" +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json[0]) return null;
  return { lat: Number(json[0].lat), lng: Number(json[0].lon) };
}

/**
 * Ищем от точного к общему: дом → улица → город. Пин на улице лучше, чем
 * отсутствие пина: покупатель всё равно ориентируется по адресу под ним.
 */
async function geocode(address) {
  const { city, street, house } = parseAddress(address);
  const tries = [
    house && street ? `${city}, ${street} ${house}` : null,
    street ? `${city}, ${street}` : null,
    city,
  ].filter(Boolean);

  for (const q of tries) {
    const found = await lookup(q);
    await sleep(PAUSE_MS);
    if (found) return { ...found, precision: tries.indexOf(q) };
  }
  return null;
}

async function main() {
  const rows = JSON.parse(readFileSync(FILE, "utf8"));
  const todo = rows.filter((r) => FORCE || r.length < 4);
  console.log(`🗺️  Геокодирование: ${todo.length} из ${rows.length}`);

  let done = 0;
  let failed = 0;

  for (const row of rows) {
    if (!FORCE && row.length >= 4) continue;
    const found = await geocode(row[1]);
    if (found) {
      row[2] = Number(found.lat.toFixed(6));
      row[3] = Number(found.lng.toFixed(6));
      done++;
    } else {
      failed++;
      console.log(`   не найден: ${row[1]}`);
    }
    if ((done + failed) % 25 === 0) {
      console.log(`   ... ${done + failed}/${todo.length}`);
      // Пишем по ходу дела: обрыв на середине не должен стоить всей работы.
      writeFileSync(FILE, format(rows));
    }
  }

  writeFileSync(FILE, format(rows));
  console.log(`✅ Размечено: ${done}, не найдено: ${failed}`);
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
