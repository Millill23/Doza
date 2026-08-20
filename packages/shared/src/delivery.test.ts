/**
 * Тесты данных для отправки посылки.
 * Запуск: node --test packages/shared/src/delivery.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateDelivery,
  normalizeDelivery,
  isValidPostalCode,
  isBelarusRegion,
  BELARUS_REGIONS,
} from "./delivery.ts";

const ok = {
  lastName: "Иванов",
  firstName: "Иван",
  middleName: "Иванович",
  postalCode: "220030",
  region: "г. Минск",
  city: "Минск",
  address: "пр. Независимости, 10, кв. 5",
};

test("полные данные проходят проверку", () => {
  assert.equal(validateDelivery(ok), null);
});

test("каждое поле обязательно", () => {
  for (const key of Object.keys(ok) as (keyof typeof ok)[]) {
    assert.notEqual(
      validateDelivery({ ...ok, [key]: "" }),
      null,
      `пустое ${key} должно быть ошибкой`,
    );
  }
});

test("отчество обязательно — почта не выдаст посылку без него", () => {
  assert.match(validateDelivery({ ...ok, middleName: "  " })!, /отчество/i);
});

test("индекс — ровно шесть цифр", () => {
  assert.equal(isValidPostalCode("220030"), true);
  assert.equal(isValidPostalCode("22003"), false, "пять цифр");
  assert.equal(isValidPostalCode("2200301"), false, "семь цифр");
  assert.equal(isValidPostalCode("22003a"), false, "буква");
  assert.equal(isValidPostalCode(" 220030 "), true, "пробелы по краям режем");
});

test("область выбирается из списка, а не пишется руками", () => {
  // Иначе на бланке окажется «мінская вобласць» или «МО», и почта развернёт.
  assert.equal(isBelarusRegion("Минская область"), true);
  assert.equal(isBelarusRegion("Минск"), false);
  assert.equal(isBelarusRegion("Московская область"), false);
  assert.equal(BELARUS_REGIONS.length, 7);
});

test("нормализация схлопывает лишние пробелы", () => {
  const n = normalizeDelivery({
    ...ok,
    lastName: "  Иванов  ",
    address: "пр.   Независимости,   10",
    postalCode: " 220030 ",
  });
  assert.equal(n.lastName, "Иванов");
  assert.equal(n.address, "пр. Независимости, 10");
  assert.equal(n.postalCode, "220030");
});
