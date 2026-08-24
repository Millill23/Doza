/**
 * Тесты разбора адресов Европочты.
 * Запуск: node --test packages/shared/src/europost-address.test.ts
 *
 * Все адреса — настоящие, из `europost-offices.json`. Именно на них геокодер
 * промахивался мимо отделения на километры.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  officeQueries,
  parseOfficeAddress,
  precisionOf,
} from "./europost-address.ts";

test("обычный адрес разбирается по частям", () => {
  assert.deepEqual(parseOfficeAddress("г. Новополоцк, ул. Еронько, 7а"), {
    locality: "Новополоцк",
    street: "Еронько",
    house: "7а",
  });
});

test("квартира и помещение в номер дома не попадают", () => {
  // «1-316» — это дом 1, помещение 316. Геокодер по «1-316» не находит ничего.
  assert.equal(parseOfficeAddress("г. Барановичи, ул. Войкова, 14-13").house, "14");
});

test("уточнение в скобках отбрасывается", () => {
  assert.deepEqual(
    parseOfficeAddress("г. Глубокое, ул. Ленина, 9А-1 (м-н «Евроопт»)"),
    { locality: "Глубокое", street: "Ленина", house: "9А" },
  );
});

// ── Ради чего всё затевалось ────────────────────────────────────────────────

test("агрогородок внутри города — это и есть адрес отделения", () => {
  // Случай из жизни: отделение №584 в Копище стояло на карте в центре Минска,
  // в двенадцати километрах от себя. Покупатель, живущий рядом, его не нашёл.
  assert.deepEqual(
    parseOfficeAddress("г. Минск, аг. Копище, ул. Михайлашева, 1-316"),
    { locality: "Копище", street: "Михайлашева", house: "1" },
  );
});

test("сельсовет — не населённый пункт, деревня рядом с ним — да", () => {
  assert.equal(
    parseOfficeAddress("Сеницкий с/с, аг. Сеница, ул. Зелёная, 1-4").locality,
    "Сеница",
  );
});

test("инициал перед фамилией убирается", () => {
  // В OpenStreetMap улица зовётся «улица Сергея Есенина»: по «С.Есенина»
  // не находится ничего, по «Есенина» — находится.
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
  assert.deepEqual(officeQueries("г. Новополоцк, ул. Еронько, 7а"), [
    { q: "Новополоцк, Еронько 7а", expect: "house" },
    { q: "Новополоцк, Еронько", expect: "street" },
    { q: "Новополоцк", expect: "locality" },
  ]);
});

test("без номера дома запрос про дом не задаётся", () => {
  const qs = officeQueries("Сеницкий с/с, д. Сеница-Копиевичи");
  assert.ok(!qs.some((q) => q.expect === "house"));
});

// ── Что вернул геокодер ─────────────────────────────────────────────────────

test("тип ответа важнее того, о чём спросили", () => {
  // На запрос дома Nominatim может вернуть город целиком — и именно так
  // пять минских отделений получили одну точку на всех.
  assert.equal(precisionOf("house_number"), "house");
  assert.equal(precisionOf("building"), "house");
  assert.equal(precisionOf("road"), "street");
  assert.equal(precisionOf("city"), "locality");
  assert.equal(precisionOf("town"), "locality");
  assert.equal(precisionOf("administrative"), "locality");
});

test("неизвестный тип считаем неточным, а не точным", () => {
  // Ошибиться в сторону «не знаю» безопасно: отделение останется в списке без
  // расстояния. Ошибиться в другую — значит соврать покупателю про километры.
  assert.equal(precisionOf(undefined), "locality");
  assert.equal(precisionOf(""), "locality");
  assert.equal(precisionOf("что-то новое"), "locality");
});
