/**
 * Тесты промокодов.
 * Запуск: node --test packages/db/src/promo-code-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePromoCode,
  promoCodeStatus,
  promoCodeError,
  PROMO_CODE_MAX_LENGTH,
} from "./promo-code-rules.ts";

test("регистр не важен", () => {
  assert.equal(normalizePromoCode("leto20"), "LETO20");
  assert.equal(normalizePromoCode("LeTo20"), "LETO20");
});

test("пробелы не мешают", () => {
  // «LETO 20» и «LETO20» для покупателя одно и то же.
  assert.equal(normalizePromoCode("  leto 20 "), "LETO20");
});

test("слишком длинный код обрезается, а не ломает запрос", () => {
  const long = "A".repeat(200);
  assert.equal(normalizePromoCode(long).length, PROMO_CODE_MAX_LENGTH);
});

test("пустой ввод не превращается в пустой код-призрак", () => {
  assert.equal(normalizePromoCode(""), "");
  assert.equal(normalizePromoCode("   "), "");
});

// ── Срок действия ───────────────────────────────────────────────────────────

const НАЧАЛО = new Date("2026-08-01T00:00:00Z");
const КОНЕЦ = new Date("2026-08-31T23:59:59Z");
const живой = { isActive: true, startsAt: НАЧАЛО, endsAt: КОНЕЦ };

test("действующий код проходит", () => {
  assert.equal(promoCodeStatus(живой, new Date("2026-08-15T12:00:00Z")), "ok");
  assert.equal(promoCodeError("ok"), null);
});

test("до начала и после конца — не проходит", () => {
  assert.equal(promoCodeStatus(живой, new Date("2026-07-31T23:00:00Z")), "not_started");
  assert.equal(promoCodeStatus(живой, new Date("2026-09-01T00:00:01Z")), "expired");
});

test("выключенный код неотличим от несуществующего", () => {
  // Иначе перебором можно выяснить, какие коды вообще заведены.
  const off = { ...живой, isActive: false };
  assert.equal(
    promoCodeError(promoCodeStatus(off, new Date("2026-08-15T12:00:00Z"))),
    promoCodeError(promoCodeStatus(null)),
  );
});

test("тексты ошибок объясняют, а не отписываются", () => {
  assert.match(promoCodeError("expired") ?? "", /Срок действия/);
  assert.match(promoCodeError("not_started") ?? "", /ещё не начал/);
  assert.match(promoCodeError("unknown") ?? "", /нет/);
});
