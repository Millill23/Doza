/**
 * Тесты жизненного цикла заказа.
 * Запуск: node --test packages/db/src/order-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  canClose,
  grantsCashback,
  consumesStock,
  requiresTracking,
  notifiesReady,
  shippedSmsText,
  shippedFixSmsText,
  paidSmsText,
  readySmsText,
  orderStatusLabel,
  orderStatusPublicLabel,
  refundReversal,
  ORDER_TRANSITIONS,
  ORDER_STATUS_LABEL,
  type OrderStatusValue,
} from "./order-rules.ts";

test("цепочка идёт только вперёд и по одному шагу", () => {
  // Подтверждения нет: оплаченный заказ сразу можно отливать.
  assert.equal(canTransition("new", "decanted"), true);
  assert.equal(canTransition("decanted", "packed"), true);
  assert.equal(canTransition("packed", "shipped"), true);
});

test("шаги нельзя перепрыгнуть", () => {
  assert.equal(canTransition("new", "shipped"), false);
  assert.equal(canTransition("new", "packed"), false);
  assert.equal(canTransition("decanted", "shipped"), false);
});

test("подтверждать больше нечего", () => {
  assert.equal(canTransition("new", "confirmed"), false);
});

test("назад вернуться нельзя", () => {
  assert.equal(canTransition("shipped", "packed"), false);
  assert.equal(canTransition("decanted", "new"), false);
});

test("админ закрывает заказ, пока тот жив", () => {
  for (const s of ["new", "decanted", "packed", "shipped"] as const) {
    assert.equal(canClose(s), true, s);
  }
  for (const s of ["closed", "refunded", "rejected", "returned"] as const) {
    assert.equal(canClose(s), false, s);
  }
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

test("смена статуса ничего не начисляет и не списывает", () => {
  // И кешбек, и остатки переехали на момент оплаты: заказ считается принятым,
  // как только пришли деньги. Иначе оплаченный, но не отлитый заказ не виден
  // на складе, и тот же миллилитр уходит второй раз в кассе.
  for (const s of ["new", "decanted", "packed", "shipped", "closed"] as const) {
    assert.equal(grantsCashback(s), false, s);
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

test("исправление отправки не выдаёт себя за новую отправку", () => {
  // Случай из практики: продавец поправил службу в карточке уже после того,
  // как ушла SMS. Повтор прежнего текста покупатель прочтёт как второй заказ.
  const fix = shippedFixSmsText("belpochta", "BQ002520057BY");
  assert.match(fix, /Белпочта/);
  assert.match(fix, /BQ002520057BY/);
  assert.ok(!fix.includes("уже отправлен"), fix);
});

// ── Самовывоз ───────────────────────────────────────────────────────────────

test("самовывоз зовут за заказом, доставку — нет", () => {
  assert.equal(notifiesReady("packed", "pickup"), true);
  assert.equal(notifiesReady("packed", "europost"), false);
  // Звать нужно на упаковке, а не раньше: собранного заказа ещё нет.
  assert.equal(notifiesReady("decanted", "pickup"), false);
});

test("покупателю на самовывозе не обещают отправку", () => {
  // Обещание «отправим в течение 2 рабочих дней» тому, кто придёт сам, —
  // не мелкая неточность, а прямая дезинформация.
  const самовывоз = paidSmsText("pickup", 0);
  assert.ok(!самовывоз.includes("отправлен"), самовывоз);
  assert.match(самовывоз, /забрать/);

  assert.match(paidSmsText("europost", 0), /отправлен/);
});

test("начисленные баллы называются, только если они есть", () => {
  assert.match(paidSmsText("post", 12), /начислено 12 баллов/);
  assert.ok(!paidSmsText("post", 0).includes("начислено"));
  // Дробные — без хвоста нулей: «12.5», а не «12.50».
  assert.match(paidSmsText("post", 12.5), /начислено 12\.5 баллов/);
});

test("SMS о готовности зовёт по адресу", () => {
  const t = readySmsText("г. Новополоцк, ул. Нефтяников, 6");
  assert.match(t, /готов к выдаче/);
  assert.match(t, /Нефтяников/);
});

test("при самовывозе шаги называются выдачей, а не отправкой", () => {
  // Продавец не должен нажимать «Отправлен» на том, что человек забрал руками.
  assert.equal(orderStatusLabel("packed", "pickup"), "Готов к выдаче");
  assert.equal(orderStatusLabel("shipped", "pickup"), "Выдан");
  assert.equal(orderStatusLabel("shipped", "europost"), "Отправлен");
  assert.equal(orderStatusPublicLabel("packed", "pickup"), "Готов к выдаче");
  assert.equal(orderStatusPublicLabel("decanted", "pickup"), "Собираем");
});

test("возврат оплаченного откатывает кешбек и склад на любом шаге", () => {
  // Оплата — единственный момент, когда начисляется кешбек и списываются
  // остатки, поэтому и откатывать их нужно независимо от того, докуда дошёл
  // заказ. Даже совсем новый уже успел и то и другое.
  for (const s of ["new", "decanted", "packed", "shipped", "closed"] as const) {
    const r = refundReversal(s);
    assert.equal(r.revokeCashback, true, s);
    assert.equal(r.restoreStock, true, s);
  }
});

test("у неоплаченного заказа откатывать нечего", () => {
  // `rejected` ставится, когда платёж не прошёл: ни баллов, ни списаний.
  const r = refundReversal("rejected");
  assert.equal(r.revokeCashback, false);
  assert.equal(r.restoreStock, false);
});

test("списанные баллы возвращаются на любом шаге", () => {
  for (const s of ["new", "decanted", "packed", "shipped", "rejected"] as const) {
    assert.equal(refundReversal(s).refundSpentPoints, true, s);
  }
});
