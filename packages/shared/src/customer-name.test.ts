/**
 * Тесты валидации имени клиента.
 * Запуск: node --test packages/shared/src/customer-name.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidCustomerName,
  normalizeCustomerName,
  assertCustomerName,
} from "./customer-name.ts";

test("обычные русские имена проходят", () => {
  for (const n of ["Анна", "анна", "АННА", "Мария Иванова", "Анна-Мария", "Пётр", "Ёлка"]) {
    assert.ok(isValidCustomerName(n), `отклонено: ${n}`);
  }
});

test("случай из практики: «<3» в имени отклоняется", () => {
  assert.equal(isValidCustomerName("Аня <3"), false);
  assert.equal(isValidCustomerName("<3"), false);
});

test("латиница отклоняется", () => {
  assert.equal(isValidCustomerName("Anna"), false);
  assert.equal(isValidCustomerName("Аннa"), false); // последняя буква латинская
});

test("цифры и спецсимволы отклоняются", () => {
  for (const n of ["Анна1", "Анна!", "Анна@mail", "Анна&Петр", "Анна>Петр", "Анна_Петр"]) {
    assert.equal(isValidCustomerName(n), false, `принято: ${n}`);
  }
});

test("имя не может начинаться с пробела или дефиса", () => {
  assert.equal(isValidCustomerName("-Анна"), false);
  assert.equal(isValidCustomerName(" Анна"), true); // пробелы по краям обрезаются
});

test("слишком короткое и слишком длинное отклоняются", () => {
  assert.equal(isValidCustomerName("А"), false);
  assert.equal(isValidCustomerName("А".repeat(61)), false);
  assert.equal(isValidCustomerName("А".repeat(60)), true);
});

test("нормализация: края и повторные пробелы", () => {
  assert.equal(normalizeCustomerName("  Анна   Иванова  "), "Анна Иванова");
});

test("assert возвращает нормализованное имя", () => {
  assert.equal(assertCustomerName("  Анна  Иванова "), "Анна Иванова");
});

test("assert бросает понятную ошибку", () => {
  assert.throws(() => assertCustomerName("Аня <3"), /только русские буквы/);
  assert.throws(() => assertCustomerName("А"), /минимум 2 символа/);
});

test("пустое имя отклоняется", () => {
  assert.equal(isValidCustomerName(""), false);
  assert.equal(isValidCustomerName("   "), false);
});
