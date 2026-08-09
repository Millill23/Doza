/**
 * Тесты форматирования.
 * Запуск: node --test packages/shared/src/format.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, formatByn, normalizePhone } from "./index.ts";

test("белорусский номер (12 цифр) форматируется", () => {
  assert.equal(formatPhone("375292453333"), "+375 (29) 245-33-33");
  assert.equal(formatPhone("375291111111"), "+375 (29) 111-11-11");
  assert.equal(formatPhone("375331234567"), "+375 (33) 123-45-67");
});

test("формат не зависит от разделителей во вводе", () => {
  assert.equal(formatPhone("+375 (29) 245-33-33"), "+375 (29) 245-33-33");
  assert.equal(formatPhone("+375292453333"), "+375 (29) 245-33-33");
});

test("нестандартную длину возвращаем как есть", () => {
  // 11 цифр — не белорусский номер, раньше именно эта ветка и срабатывала
  assert.equal(formatPhone("37529245333"), "37529245333");
  assert.equal(formatPhone("123"), "123");
  assert.equal(formatPhone(""), "");
});

test("иностранный номер не трогаем", () => {
  assert.equal(formatPhone("79161234567"), "79161234567");
});

test("normalizePhone оставляет только цифры", () => {
  assert.equal(normalizePhone("+375 (29) 245-33-33"), "375292453333");
});

test("formatByn — две цифры после запятой", () => {
  assert.equal(formatByn(10), "10.00 BYN");
  assert.equal(formatByn("33.333"), "33.33 BYN");
});
