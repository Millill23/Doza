/**
 * Разбор адреса отделения Европочты для геокодера.
 *
 * Адреса приходят в вольном виде: «г. Минск, аг. Копище, ул. Михайлашева,
 * 1-316», «г. Гродно, пр-т. Я.Купалы, 82А (м-н «Евроопт»)», «Сеницкий с/с,
 * д. Сеница-Копиевичи». Наивное «первая часть – город, вторая – улица»
 * спотыкается на каждом втором из этих случаев.
 *
 * Живёт в общем пакете, потому что размечают отделения двое: разовый скрипт
 * `geocode-europost.mjs` и ночная задача `/api/cron/geocode-offices`. Раньше у
 * каждого была своя копия разбора – и ошибка, разумеется, тоже своя в каждой.
 */

/** Насколько точно геокодер попал в адрес. */
export type Precision = "house" | "street" | "locality";

export interface ParsedOfficeAddress {
  /** Населённый пункт: для «г. Минск, аг. Копище» это Копище, а не Минск. */
  locality: string;
  street: string;
  /** Номер дома без квартиры и помещения. */
  house: string;
  /**
   * Тип улицы словом: «улица», «проезд», «шоссе». Пусто, если в адресе его не
   * было. Нужен для запроса к геокодеру – с ним он находит заметно лучше.
   */
  streetType: string;
}

export interface OfficeQuery {
  q: string;
  /** На что рассчитываем: запрос с домом может вернуть и улицу. */
  expect: Precision;
}

/** «г.», «аг.», «Сеницкий с/с» – всё, чем помечают населённый пункт. */
const SETTLEMENT = /^(г|аг|гп|пгт|п|д|с|к\.?п)\.\s*|^(.+?)\s+с\/с$/i;

/**
 * Сокращения типа улицы. Порядок важен: длинные варианты идут первыми.
 *
 * Раньше «пр» стоял перед «пр-д», и из «пр-д Алексея Гаранина» срезалось
 * только «пр» – геокодер получал «-д Алексея Гаранина» и, разумеется, ничего
 * не находил.
 */
/**
 * За сокращением обязательна точка или пробел. Иначе однобуквенное «ш»
 * съедало первую букву улицы: «Шевченко» превращалось в «евченко».
 */
const STREET_TYPE =
  /^(пр-т|пр-д|тр-т|б-р|бул|тракт|мкр|наб|пер|ул|пр|пл|ш)(?:\.\s*|\s+)/i;

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
  // Отделение Европочты в OSM часто размечено как офис, а не как магазин или
  // здание. Без этого типа точный ответ отбрасывался как «центр города», и
  // ночная задача годами перебирала одни и те же адреса впустую.
  "office",
  "industrial",
  "craft",
  "healthcare",
  "leisure",
  "tourism",
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
  // Обобщённый ответ про дорогу. Приходит, когда у улицы в OSM не проставлен
  // конкретный класс, – но это всё равно улица, а не город.
  "highway",
  "track",
  "path",
  "motorway",
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
 * «улица Сергея Есенина». По одной фамилии геокодер находит, с инициалом –
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
  // Квартира и помещение идут после дефиса – геокодеру они только мешают.
  const m = part.match(/(\d+\s*[а-яa-z]?)(?=\s*(?:-|\/|$|,))/i);
  return m ? m[1].replace(/\s+/g, "") : "";
}

/**
 * Сокращение типа улицы – полным словом.
 *
 * Nominatim ищет по названиям как они записаны в OpenStreetMap, а там улицы
 * зовутся «улица Казинца», а не «Казинца». Без этого слова половина адресов не
 * находилась вовсе: восемь отделений так и остались без точки на карте.
 */
const STREET_TYPE_WORD: Record<string, string> = {
  "ул": "улица",
  "пр": "проспект",
  "пр-т": "проспект",
  "пр-д": "проезд",
  "б-р": "бульвар",
  "бул": "бульвар",
  "пер": "переулок",
  "ш": "шоссе",
  "тр-т": "тракт",
  "тракт": "тракт",
  "мкр": "микрорайон",
  "пл": "площадь",
  "наб": "набережная",
};

function streetTypeWord(part: string): string {
  const m = part.match(STREET_TYPE);
  return m ? (STREET_TYPE_WORD[m[1].toLowerCase()] ?? "") : "";
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
 * аг. Копище» отделение стоит в Копище, и искать его в Минске бессмысленно –
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
  const streetType = streetAt >= 0 ? streetTypeWord(rest[streetAt]) : "";

  return { locality, street, house, streetType };
}

/**
 * Запросы к геокодеру от точного к общему.
 *
 * Запрос на весь населённый пункт тоже нужен – но не ради координат, а чтобы
 * знать, что улицу найти не удалось: такой ответ мы отбрасываем.
 */
export function officeQueries(raw: string): OfficeQuery[] {
  const { locality, street, house, streetType } = parseOfficeAddress(raw);
  const queries: OfficeQuery[] = [];

  // Сначала – с типом улицы словом. Проверено на тех адресах, что не давались
  // годами: «улица Тексер 4, Барановичи» находит дом, «Барановичи, Тексер» –
  // только квартал, то есть ничего.
  if (locality && street && house && streetType) {
    queries.push({ q: `${streetType} ${street} ${house}, ${locality}`, expect: "house" });
  }
  if (locality && street && house) {
    queries.push({ q: `${locality}, ${street} ${house}`, expect: "house" });
  }

  // Дом без буквенного индекса. «улица Смоленская 5А» не находится, «улица
  // Смоленская 5» – находится: литера у здания в OpenStreetMap часто не
  // размечена. Соседний корпус точнее, чем вся улица, и куда точнее, чем ничего.
  const bare = house.replace(/[^\d]/g, "");
  if (locality && street && streetType && bare && bare !== house) {
    queries.push({ q: `${streetType} ${street} ${bare}, ${locality}`, expect: "house" });
  }
  if (locality && street && streetType) {
    queries.push({ q: `${streetType} ${street}, ${locality}`, expect: "street" });
  }
  if (locality && street) {
    queries.push({ q: `${locality}, ${street}`, expect: "street" });
  }
  if (locality) {
    queries.push({ q: locality, expect: "locality" });
  }
  return queries;
}

/** Найденная точка с оценкой того, насколько геокодер попал. */
export interface GeoHit {
  lat: number;
  lng: number;
  precision: Precision;
}

/**
 * Выбрать лучшее из двух попаданий.
 *
 * Нужна потому, что брать первое попадание нельзя: запросы идут от точного к
 * общему, но геокодер на точный вопрос отвечает чем найдёт. На «улица
 * Смоленская 5А» он вернул всю улицу, и перебор останавливался – хотя
 * следующий запрос, без литеры дома, находил само здание.
 *
 * Ответ уровня «город» не попадание вовсе: он выглядит как обычная точка, но
 * означает «улицу найти не удалось, вот вам центр», и врёт на километры.
 */
export function bestHit(a: GeoHit | null, b: GeoHit | null): GeoHit | null {
  const usable = (h: GeoHit | null) => (h && h.precision !== "locality" ? h : null);
  const x = usable(a);
  const y = usable(b);
  if (!x) return y;
  if (!y) return x;
  return x.precision === "house" ? x : y;
}

/** Точнее уже не найти – перебор можно прекращать. */
export function isExactHit(hit: GeoHit | null): boolean {
  return hit?.precision === "house";
}
