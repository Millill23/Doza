/**
 * Разбор адреса отделения Европочты для геокодера.
 *
 * Адреса приходят в вольном виде: «г. Минск, аг. Копище, ул. Михайлашева,
 * 1-316», «г. Гродно, пр-т. Я.Купалы, 82А (м-н «Евроопт»)», «Сеницкий с/с,
 * д. Сеница-Копиевичи». Наивное «первая часть — город, вторая — улица»
 * спотыкается на каждом втором из этих случаев.
 *
 * Живёт в общем пакете, потому что размечают отделения двое: разовый скрипт
 * `geocode-europost.mjs` и ночная задача `/api/cron/geocode-offices`. Раньше у
 * каждого была своя копия разбора — и ошибка, разумеется, тоже своя в каждой.
 */

/** Насколько точно геокодер попал в адрес. */
export type Precision = "house" | "street" | "locality";

export interface ParsedOfficeAddress {
  /** Населённый пункт: для «г. Минск, аг. Копище» это Копище, а не Минск. */
  locality: string;
  street: string;
  /** Номер дома без квартиры и помещения. */
  house: string;
}

export interface OfficeQuery {
  q: string;
  /** На что рассчитываем: запрос с домом может вернуть и улицу. */
  expect: Precision;
}

/** «г.», «аг.», «Сеницкий с/с» — всё, чем помечают населённый пункт. */
const SETTLEMENT = /^(г|аг|гп|пгт|п|д|с|к\.?п)\.\s*|^(.+?)\s+с\/с$/i;

const STREET_TYPE =
  /^(ул|пр-т|пр|б-р|бул|пер|ш|тр-т|мкр|пл|пр-д|тракт|наб)\.?\s*/i;

/**
 * Типы объектов Nominatim в порядке убывания точности.
 *
 * Отвечает он не на то, о чём спросили, а тем, что нашёл: на запрос дома в
 * несуществующей улице вернётся город целиком. Поэтому решает не наш запрос,
 * а тип ответа.
 */
const HOUSE_TYPES = new Set([
  "house",
  "house_number",
  "building",
  "shop",
  "amenity",
  "commercial",
  "retail",
  "yes",
]);

const STREET_TYPES = new Set([
  "road",
  "residential",
  "street",
  "pedestrian",
  "living_street",
  "tertiary",
  "secondary",
  "primary",
  "trunk",
  "footway",
  "service",
  "unclassified",
]);

/** Что нам на самом деле вернул геокодер. */
export function precisionOf(addresstype: string | undefined | null): Precision {
  const t = (addresstype ?? "").toLowerCase();
  if (HOUSE_TYPES.has(t)) return "house";
  if (STREET_TYPES.has(t)) return "street";
  return "locality";
}

/**
 * Убрать инициалы: «С.Есенина» → «Есенина», «Колесникова П.Р.» → «Колесникова».
 *
 * Европочта пишет их вплотную к фамилии, а в OpenStreetMap улица зовётся
 * «улица Сергея Есенина». По одной фамилии геокодер находит, с инициалом —
 * нет, и адрес сваливался до центра города.
 */
function stripInitials(street: string): string {
  return street
    .replace(/(^|\s)[А-ЯЁA-Z]\.\s*(?=[А-ЯЁA-Z][а-яёa-z])/g, "$1")
    .replace(/\s+[А-ЯЁA-Z]\.(\s*[А-ЯЁA-Z]\.)*\s*$/g, "")
    .trim();
}

/** Номер дома: «1-316» → «1», «д. 301-1» → «301», «в районе дома №61» → «61». */
function houseOf(part: string): string {
  // Квартира и помещение идут после дефиса — геокодеру они только мешают.
  const m = part.match(/(\d+\s*[а-яa-z]?)(?=\s*(?:-|\/|$|,))/i);
  return m ? m[1].replace(/\s+/g, "") : "";
}

function isSettlement(part: string): boolean {
  return SETTLEMENT.test(part);
}

function stripSettlement(part: string): string {
  const сс = part.match(/^(.+?)\s+с\/с$/i);
  if (сс) return сс[1].trim();
  return part.replace(/^(г|аг|гп|пгт|п|д|с|к\.?п)\.\s*/i, "").trim();
}

/**
 * Разложить адрес на населённый пункт, улицу и дом.
 *
 * Населённым пунктом считаем последний из перечисленных: в «г. Минск,
 * аг. Копище» отделение стоит в Копище, и искать его в Минске бессмысленно —
 * это разные точки в двенадцати километрах друг от друга.
 */
export function parseOfficeAddress(raw: string): ParsedOfficeAddress {
  const parts = raw
    .replace(/\s*\([^)]*\)/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let localityAt = 0;
  for (let i = 0; i < parts.length; i++) {
    if (isSettlement(parts[i]) && !STREET_TYPE.test(parts[i])) localityAt = i;
    else if (i > 0) break;
  }

  const locality = stripSettlement(parts[localityAt] ?? "");

  const rest = parts.slice(localityAt + 1);
  const streetAt = rest.findIndex((p) => STREET_TYPE.test(p) || !/^\d/.test(p));
  const street =
    streetAt >= 0 ? stripInitials(rest[streetAt].replace(STREET_TYPE, "").trim()) : "";

  const house = streetAt >= 0 ? houseOf(rest[streetAt + 1] ?? "") : "";

  return { locality, street, house };
}

/**
 * Запросы к геокодеру от точного к общему.
 *
 * Запрос на весь населённый пункт тоже нужен — но не ради координат, а чтобы
 * знать, что улицу найти не удалось: такой ответ мы отбрасываем.
 */
export function officeQueries(raw: string): OfficeQuery[] {
  const { locality, street, house } = parseOfficeAddress(raw);
  const queries: OfficeQuery[] = [];

  if (locality && street && house) {
    queries.push({ q: `${locality}, ${street} ${house}`, expect: "house" });
  }
  if (locality && street) {
    queries.push({ q: `${locality}, ${street}`, expect: "street" });
  }
  if (locality) {
    queries.push({ q: locality, expect: "locality" });
  }
  return queries;
}
