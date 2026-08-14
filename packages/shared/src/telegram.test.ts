/**
 * Тесты экранирования для Telegram.
 * Запуск: node --test packages/shared/src/telegram.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tgEscape } from "./telegram.ts";

test("случай из практики: имя «<3» больше не ломает отправку", () => {
  // Telegram отклоняет сообщение целиком, если увидит незакрытый тег, —
  // из-за одного такого имени переставали приходить все уведомления о продажах.
  assert.equal(tgEscape("<3"), "&lt;3");
});

test("экранируются все три опасных символа", () => {
  assert.equal(tgEscape("<b>жирный</b>"), "&lt;b&gt;жирный&lt;/b&gt;");
  assert.equal(tgEscape("Иванов & Сыновья"), "Иванов &amp; Сыновья");
});

test("амперсанд экранируется первым, иначе получится двойное экранирование", () => {
  // Если сначала заменить «<», а потом «&», выйдет «&amp;lt;» — в сообщении
  // появится видимая абракадабра вместо символа.
  assert.equal(tgEscape("<"), "&lt;");
  assert.equal(tgEscape("&lt;"), "&amp;lt;");
});

test("обычный текст не меняется", () => {
  assert.equal(tgEscape("Анна-Мария Петрова"), "Анна-Мария Петрова");
  assert.equal(tgEscape("Sauvage, 3 мл ×2 — 45.00 BYN"), "Sauvage, 3 мл ×2 — 45.00 BYN");
});

test("пустые значения превращаются в пустую строку, а не в «null»", () => {
  // В сообщения подставляются необязательные поля: «null» в чеке выглядит как баг.
  assert.equal(tgEscape(null), "");
  assert.equal(tgEscape(undefined), "");
  assert.equal(tgEscape(""), "");
});

test("числа приводятся к строке", () => {
  assert.equal(tgEscape(42), "42");
  assert.equal(tgEscape(0), "0");
});
