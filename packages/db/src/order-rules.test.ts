/**
 * Тесты жизненного цикла заказа.
 * Запуск: node --test packages/db/src/order-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  grantsCashback,
  consumesStock,
  requiresTracking,
  shippedSmsText,
  refundReversal,
  ORDER_TRANSITIONS,
  ORDER_STATUS_LABEL,
  type OrderStatusValue,
} from "./order-rules.ts";

test("цепочка идёт только вперёд и по одному шагу", () => {
  assert.equal(canTransition("new", "confirmed"), true);
  assert.equal(canTransition("confirmed", "decanted"), true);
  assert.equal(canTransition("decanted", "packed"), true);
  assert.equal(canTransition("packed", "shipped"), true);
});

test("шаги нельзя перепрыгнуть", () => {
  // Иначе можно отправить нераспитый заказ или упаковать неподтверждённый.
  assert.equal(canTransition("new", "shipped"), false);
  assert.equal(canTransition("new", "decanted"), false);
  assert.equal(canTransition("confirmed", "packed"), false);
});

test("назад вернуться нельзя", () => {
  assert.equal(canTransition("shipped", "packed"), false);
  assert.equal(canTransition("confirmed", "new"), false);
});

test("возврат не входит в цепочку — это отдельное действие", () => {
  for (const from of Object.keys(ORDER_TRANSITIONS) as OrderStatusValue[]) {
    assert.equal(canTransition(from, "refunded"), false, from);
  }
});

test("из отправленного и возвращённого дальше хода нет", () => {
  assert.deepEqual(ORDER_TRANSITIONS.shipped, []);
  assert.deepEqual(ORDER_TRANSITIONS.refunded, []);
});

test("старые статусы сохранены, но тупиковые", () => {
  // Данные закрытых заказов из прежней схемы не должны потеряться.
  for (const s of ["closed", "rejected", "returned"] as const) {
    assert.ok(ORDER_STATUS_LABEL[s], `нет подписи для ${s}`);
    assert.deepEqual(ORDER_TRANSITIONS[s], []);
  }
});

test("кешбек начисляется на подтверждении, и только там", () => {
  assert.equal(grantsCashback("confirmed"), true);
  for (const s of ["new", "decanted", "packed", "shipped"] as const) {
    assert.equal(grantsCashback(s), false, s);
  }
});

test("остатки списываются на распиве, и только там", () => {
  assert.equal(consumesStock("decanted"), true);
  for (const s of ["new", "confirmed", "packed", "shipped"] as const) {
    assert.equal(consumesStock(s), false, s);
  }
});

test("трек-номер обязателен при отправке почтой", () => {
  assert.equal(requiresTracking("shipped", "post"), true);
});

test("для самовывоза трек-номер не нужен", () => {
  // Посылки нет — требовать номер отслеживания бессмысленно.
  assert.equal(requiresTracking("shipped", "pickup"), false);
  assert.equal(requiresTracking("packed", "post"), false);
});

test("SMS об отправке называет службу и номер", () => {
  const t = shippedSmsText("europochta", "EP123456789BY");
  assert.match(t, /Европочта/);
  assert.match(t, /EP123456789BY/);
  assert.equal(
    shippedSmsText("belpochta", "BY1").includes("Белпочта"),
    true,
  );
});

test("возврат нового заказа не трогает баллы за кешбек и склад", () => {
  // Ни кешбека, ни распива ещё не было — откатывать нечего.
  const r = refundReversal("new");
  assert.equal(r.refundSpentPoints, true);
  assert.equal(r.revokeCashback, false);
  assert.equal(r.restoreStock, false);
});

test("возврат подтверждённого отбирает кешбек, но не трогает склад", () => {
  const r = refundReversal("confirmed");
  assert.equal(r.revokeCashback, true);
  assert.equal(r.restoreStock, false, "распива ещё не было");
});

test("возврат после распива возвращает парфюм на склад", () => {
  for (const s of ["decanted", "packed", "shipped"] as const) {
    const r = refundReversal(s);
    assert.equal(r.revokeCashback, true, s);
    assert.equal(r.restoreStock, true, s);
  }
});

test("списанные баллы возвращаются на любом шаге", () => {
  for (const s of ["new", "confirmed", "decanted", "packed", "shipped"] as const) {
    assert.equal(refundReversal(s).refundSpentPoints, true, s);
  }
});
