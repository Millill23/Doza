/**
 * Тесты разбора адресов Европочты.
 * Запуск: node --test packages/shared/src/europost-address.test.ts
 *
 * Все адреса – настоящие, из `europost-offices.json`. Именно на них геокодер
 * промахивался мимо отделения на километры.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  officeQueries,
  parseOfficeAddress,
  precisionOf,
  bestHit,
  isExactHit,
} from "./europost-address.ts";

test("обычный адрес разбирается по частям", () => {
  assert.deepEqual(parseOfficeAddress("г. Новополоцк, ул. Еронько, 7а"), {
    locality: "Новополоцк",
    street: "Еронько",
    house: "7а",
    streetType: "улица",
  });
});

test("квартира и помещение в номер дома не попадают", () => {
  // «1-316» – это дом 1, помещение 316. Геокодер по «1-316» не находит ничего.
  assert.equal(parseOfficeAddress("г. Барановичи, ул. Войкова, 14-13").house, "14");
});

test("уточнение в скобках отбрасывается", () => {
  assert.deepEqual(
    parseOfficeAddress("г. Глубокое, ул. Ленина, 9А-1 (м-н «Евроопт»)"),
    { locality: "Глубокое", street: "Ленина", house: "9А", streetType: "улица" },
  );
});

// ── Ради чего всё затевалось ────────────────────────────────────────────────

test("агрогородок внутри города – это и есть адрес отделения", () => {
  // Случай из жизни: отделение №584 в Копище стояло на карте в центре Минска,
  // в двенадцати километрах от себя. Покупатель, живущий рядом, его не нашёл.
  assert.deepEqual(
    parseOfficeAddress("г. Минск, аг. Копище, ул. Михайлашева, 1-316"),
    { locality: "Копище", street: "Михайлашева", house: "1", streetType: "улица" },
  );
});

test("сельсовет – не населённый пункт, деревня рядом с ним – да", () => {
  assert.equal(
    parseOfficeAddress("Сеницкий с/с, аг. Сеница, ул. Зелёная, 1-4").locality,
    "Сеница",
  );
});

test("инициал перед фамилией убирается", () => {
  // В OpenStreetMap улица зовётся «улица Сергея Есенина»: по «С.Есенина»
  // не находится ничего, по «Есенина» – находится.
  assert.equal(parseOfficeAddress("г. Минск, ул. С.Есенина, 6-208").street, "Есенина");
  assert.equal(parseOfficeAddress("г. Гродно, пр-т. Я.Купалы, 87").street, "Купалы");
  assert.equal(parseOfficeAddress("г. Городок, ул. К. Маркса, 87-1").street, "Маркса");
});

test("инициалы после фамилии убираются тоже", () => {
  assert.equal(
    parseOfficeAddress("г. Минск, ул. Колесникова П.Р., 20-135").street,
    "Колесникова",
  );
  assert.equal(
    parseOfficeAddress("г. Минск, ул. Крупской Н.К., 10").street,
    "Крупской",
  );
});

test("фамилия из одной буквы не считается инициалом", () => {
  // Иначе «ул. Я. Коласа» превратилась бы в пустую строку.
  assert.equal(
    parseOfficeAddress("г. Сморгонь, ул. Якуба Коласа, 80Г-1").street,
    "Якуба Коласа",
  );
});

// ── Запросы к геокодеру ─────────────────────────────────────────────────────

test("спрашиваем от точного к общему", () => {
  // Первым идёт запрос с типом улицы словом: в OpenStreetMap улицы так и
  // записаны, и без этого слова геокодер половину адресов не находит вовсе.
  assert.deepEqual(officeQueries("г. Новополоцк, ул. Еронько, 7а"), [
    { q: "улица Еронько 7а, Новополоцк", expect: "house" },
    { q: "Новополоцк, Еронько 7а", expect: "house" },
    // Без литеры: «7а» в OpenStreetMap может быть не размечена, «7» – есть.
    { q: "улица Еронько 7, Новополоцк", expect: "house" },
    { q: "улица Еронько, Новополоцк", expect: "street" },
    { q: "Новополоцк, Еронько", expect: "street" },
    { q: "Новополоцк", expect: "locality" },
  ]);
});

test("тип улицы разворачивается в слово, которое знает OpenStreetMap", () => {
  assert.equal(parseOfficeAddress("г. Орша, пр-д Алексея Гаранина, 4/1").streetType, "проезд");
  assert.equal(parseOfficeAddress("г. Гродно, пр-т. Я.Купалы, 87").streetType, "проспект");
  assert.equal(parseOfficeAddress("г. Минск, б-р Шевченко, 5").streetType, "бульвар");
  // Типа в адресе нет – и выдумывать его не надо.
  assert.equal(parseOfficeAddress("Сеницкий с/с, д. Сеница-Копиевичи").streetType, "");
});

test("без номера дома запрос про дом не задаётся", () => {
  const qs = officeQueries("Сеницкий с/с, д. Сеница-Копиевичи");
  assert.ok(!qs.some((q) => q.expect === "house"));
});

// ── Что вернул геокодер ─────────────────────────────────────────────────────

test("тип ответа важнее того, о чём спросили", () => {
  // На запрос дома Nominatim может вернуть город целиком – и именно так
  // пять минских отделений получили одну точку на всех.
  assert.equal(precisionOf("house_number"), "house");
  assert.equal(precisionOf("building"), "house");
  assert.equal(precisionOf("road"), "street");
  assert.equal(precisionOf("city"), "locality");
  assert.equal(precisionOf("town"), "locality");
  assert.equal(precisionOf("administrative"), "locality");
});

test("длинные сокращения типа улицы разбираются целиком", () => {
  // «пр» стоял в регулярке раньше «пр-д», срезалось только он – и геокодер
  // получал «-д Алексея Гаранина». Отделение в Орше осталось без точки.
  const q = officeQueries("г. Орша, пр-д Алексея Гаранина, 4/1");
  assert.ok(!q.some((x) => x.q.includes("-д ")), `осталось «-д»: ${q[0].q}`);
  assert.match(q[0].q, /проезд Алексея Гаранина 4, Орша/);
});

test("однобуквенное сокращение не съедает первую букву улицы", () => {
  // «ш» без точки и пробела – это не шоссе, а начало названия.
  const q = officeQueries("г. Брест, ул. Шевченко, 5");
  assert.match(q[0].q, /Шевченко/);
});

test("отделение как офис – это точный адрес, а не центр города", () => {
  // Восемь отделений годами оставались без точки на карте именно из-за этого:
  // Nominatim размечает их как office и highway, а список знал только shop и
  // road – и точный ответ отбрасывался наравне с городским центром.
  assert.equal(precisionOf("office"), "house");
  assert.equal(precisionOf("shop"), "house");
  assert.equal(precisionOf("highway"), "street");
});

test("неизвестный тип считаем неточным, а не точным", () => {
  // Ошибиться в сторону «не знаю» безопасно: отделение останется в списке без
  // расстояния. Ошибиться в другую – значит соврать покупателю про километры.
  assert.equal(precisionOf(undefined), "locality");
  assert.equal(precisionOf(""), "locality");
  assert.equal(precisionOf("что-то новое"), "locality");
});

// ── Выбор лучшего попадания ─────────────────────────────────────────────────

const hit = (precision: "house" | "street" | "locality") => ({ lat: 1, lng: 2, precision });

test("дом важнее улицы, каким бы ни был порядок запросов", () => {
  // Брать первое попадание нельзя: на «улица Смоленская 5А» геокодер вернул
  // всю улицу, перебор останавливался – а следующий запрос, без литеры дома,
  // находил само здание.
  assert.equal(bestHit(hit("street"), hit("house"))!.precision, "house");
  assert.equal(bestHit(hit("house"), hit("street"))!.precision, "house");
});

test("город – не попадание, а признак что улицу не нашли", () => {
  assert.equal(bestHit(null, hit("locality")), null);
  assert.equal(bestHit(hit("locality"), hit("street"))!.precision, "street");
  assert.equal(bestHit(hit("street"), hit("locality"))!.precision, "street");
});

test("на доме перебор можно прекращать, на улице – нет", () => {
  assert.equal(isExactHit(hit("house")), true);
  assert.equal(isExactHit(hit("street")), false);
  assert.equal(isExactHit(null), false);
});
