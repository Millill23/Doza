/**
 * Тесты правил белорусского номера.
 * Запуск: node --test packages/shared/src/phone.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toLocalDigits,
  isValidLocalDigits,
  normalizeBelarusPhone,
  assertBelarusPhone,
  formatLocalDigits,
  PHONE_ERROR,
  toStoredPhone,
} from "./phone.ts";

test("разбирает все варианты записи одного номера", () => {
  const expected = "292453333";
  for (const input of [
    "292453333",
    "+375292453333",
    "375292453333",
    "+375 (29) 245-33-33",
    "80292453333", // внутрибелорусский набор
    "8 029 245 33 33",
  ]) {
    assert.equal(toLocalDigits(input), expected, `не разобрал: ${input}`);
  }
});

test("годные коды операторов", () => {
  for (const code of ["25", "29", "33", "44"]) {
    assert.equal(isValidLocalDigits(`${code}1234567`), true, `код ${code} отклонён`);
  }
});

test("несуществующий код оператора отклоняется", () => {
  // Опечатка в коде — самая частая ошибка ввода, её и ловим.
  for (const code of ["11", "99", "17", "22", "30"]) {
    assert.equal(isValidLocalDigits(`${code}1234567`), false, `код ${code} пропущен`);
  }
});

test("неверная длина отклоняется", () => {
  assert.equal(isValidLocalDigits("2924533"), false); // мало
  assert.equal(isValidLocalDigits("2924533331"), false); // много
  assert.equal(isValidLocalDigits(""), false);
});

test("нормализация даёт хранимый вид", () => {
  assert.equal(normalizeBelarusPhone("+375 (29) 245-33-33"), "375292453333");
  assert.equal(normalizeBelarusPhone("251234567"), "375251234567");
  assert.equal(normalizeBelarusPhone("111234567"), null);
});

test("assert бросает понятную ошибку", () => {
  assert.throws(() => assertBelarusPhone("111234567"), { message: PHONE_ERROR });
  assert.equal(assertBelarusPhone("292453333"), "375292453333");
});

test("российский номер не принимается за белорусский", () => {
  // 79161234567 → после отбрасывания префиксов остаётся 9 цифр «161234567»,
  // но код 16 не мобильный белорусский, поэтому номер отклоняется.
  assert.equal(normalizeBelarusPhone("79161234567"), null);
});

test("маска форматирует и незаконченный ввод", () => {
  assert.equal(formatLocalDigits(""), "");
  assert.equal(formatLocalDigits("29"), "29");
  assert.equal(formatLocalDigits("29245"), "29 245");
  assert.equal(formatLocalDigits("2924533"), "29 245-33");
  assert.equal(formatLocalDigits("292453333"), "29 245-33-33");
  // Лишние цифры обрезаются, а не ломают формат.
  assert.equal(formatLocalDigits("2924533339999"), "29 245-33-33");
});

test("toStoredPhone приводит любой ввод к виду из базы", () => {
  // Регрессия: касса отдавала девять цифр без префикса, сервер искал
  // «291234567» и не находил клиента — продавец видел непонятную ошибку.
  assert.equal(toStoredPhone("291234567"), "375291234567");
  assert.equal(toStoredPhone("375291234567"), "375291234567");
  assert.equal(toStoredPhone("+375 (29) 123-45-67"), "375291234567");
  assert.equal(toStoredPhone("80291234567"), "375291234567");
});

test("toStoredPhone не проверяет код оператора", () => {
  // Номера, заведённые до строгой маски, обязаны находиться в кассе.
  assert.equal(toStoredPhone("171234567"), "375171234567");
});
