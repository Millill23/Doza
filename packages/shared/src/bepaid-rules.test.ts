/**
 * Тесты правил платежей bePaid.
 * Запуск: node --test packages/shared/src/bepaid-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMinorUnits,
  fromMinorUnits,
  paymentOutcome,
  canAcceptPayment,
  eripOrderId,
} from "./bepaid-rules.ts";

test("копейки считаются без потерь на плавающей точке", () => {
  // 32.45 * 100 в double даёт 3244.9999999999995 — без округления покупатель
  // заплатил бы на копейку меньше, и сверка сумм разошлась бы.
  assert.equal(toMinorUnits(32.45), 3245);
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
  assert.equal(toMinorUnits(45), 4500);
  assert.equal(toMinorUnits(0), 0);
  assert.equal(toMinorUnits(12.005), 1201);
});

test("перевод копеек обратно в рубли", () => {
  assert.equal(fromMinorUnits(3245), 32.45);
  assert.equal(fromMinorUnits(4500), 45);
});

test("некорректная сумма отвергается, а не превращается в NaN копеек", () => {
  assert.throws(() => toMinorUnits(NaN));
  assert.throws(() => toMinorUnits(Infinity));
});

test("неоплаченный токен — это ожидание, а не отказ", () => {
  // Настоящий ответ bePaid на токен, по которому покупатель ещё не платил.
  // Раньше «error» трактовался как провал, и заказ отменялся ровно в тот
  // момент, когда человек вводил номер карты на странице банка.
  const fresh = { status: "error", finished: false, expired: false };
  assert.equal(paymentOutcome(fresh), "pending");
});

test("незавершённая транзакция всегда ожидание, каким бы ни был статус", () => {
  assert.equal(paymentOutcome({ status: "failed", finished: false }), "pending");
  assert.equal(paymentOutcome({ status: "successful", finished: false }), "pending");
});

test("оплаченным считается только явный successful", () => {
  const done = (status) => ({ status, finished: true });
  assert.equal(paymentOutcome(done("successful")), "paid");
  assert.equal(paymentOutcome(done("SUCCESSFUL")), "paid", "регистр не важен");
  assert.equal(paymentOutcome(done("failed")), "failed");
  assert.equal(paymentOutcome(done("error")), "failed");
  assert.equal(paymentOutcome(done("incomplete")), "pending");
  assert.equal(paymentOutcome(done(null)), "pending");
  assert.equal(paymentOutcome({}), "pending");
});

test("истёкший токен важнее любого статуса", () => {
  assert.equal(
    paymentOutcome({ status: "successful", finished: true, expired: true }),
    "expired",
  );
});

const base = {
  outcome: "paid" as const,
  isTest: false,
  allowTest: false,
  paidMinor: 4500,
  expectedMinor: 4500,
};

test("совпадающая сумма подтверждённого платежа принимается", () => {
  assert.deepEqual(canAcceptPayment(base), { ok: true });
});

test("неподтверждённый платёж не принимается", () => {
  for (const outcome of ["failed", "expired", "pending"] as const) {
    const r = canAcceptPayment({ ...base, outcome });
    assert.equal(r.ok, false, outcome);
  }
});

test("тестовая транзакция в боевом режиме не оплачивает заказ", () => {
  // Иначе тестовым платежом можно получить товар бесплатно.
  const r = canAcceptPayment({ ...base, isTest: true, allowTest: false });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /Тестовая транзакция/);
});

test("в тестовом окружении тестовая транзакция проходит", () => {
  assert.deepEqual(
    canAcceptPayment({ ...base, isTest: true, allowTest: true }),
    { ok: true },
  );
});

test("недоплата отклоняется, переплата принимается", () => {
  const less = canAcceptPayment({ ...base, paidMinor: 4499 });
  assert.equal(less.ok, false, "копейки недостаточно — уже не оплачено");
  assert.match(less.ok === false ? less.reason : "", /44\.99 BYN вместо 45 BYN/);

  assert.deepEqual(canAcceptPayment({ ...base, paidMinor: 5000 }), { ok: true });
});

test("номер заказа для ЕРИП дополняется до 12 цифр", () => {
  assert.equal(eripOrderId(5), "000000000005");
  assert.equal(eripOrderId(123456), "000000123456");
  assert.equal(eripOrderId(5).length, 12);
});
