/**
 * Тесты событий для Meta.
 * Запуск: node --test packages/shared/src/meta-events.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  orderEventId,
  hashUserData,
  normalizePhoneForMeta,
  buildPurchaseEvent,
  capiUrl,
} from "./meta-events.ts";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

test("ключ склейки один на заказ и не повторяется", () => {
  // По нему Meta объединяет браузерное и серверное событие. Разойдутся –
  // покупка посчитается дважды.
  assert.equal(orderEventId(18), "order-18");
  assert.notEqual(orderEventId(18), orderEventId(19));
});

test("телефон превращается в одни цифры", () => {
  assert.equal(normalizePhoneForMeta("+375 (29) 249-28-51"), "375292492851");
  assert.equal(normalizePhoneForMeta("375292492851"), "375292492851");
  assert.equal(normalizePhoneForMeta(null), "");
});

test("персональные данные уходят только хешем", () => {
  const u = hashUserData({
    phone: "+375 (29) 249-28-51",
    firstName: "Антон",
    lastName: "Падута",
    city: "Минск",
    postalCode: "220 030",
  });
  assert.equal(u.ph, sha("375292492851"));
  assert.equal(u.fn, sha("антон"), "приводится к нижнему регистру");
  assert.equal(u.ct, sha("минск"));
  assert.equal(u.zp, sha("220030"), "пробелы в индексе убираются");

  // Сырых значений в запросе быть не должно ни в каком виде.
  const raw = JSON.stringify(u);
  for (const v of ["375292492851", "Антон", "Падута", "Минск", "220030"]) {
    assert.ok(!raw.includes(v), `${v} утекло в открытом виде`);
  }
});

test("пустые поля не превращаются в хеш пустой строки", () => {
  // Такой хеш выглядит для Meta как настоящий признак, который ни с кем не
  // совпадёт, и только портит качество сопоставления.
  const u = hashUserData({ phone: "", firstName: "  ", lastName: null });
  assert.equal(u.ph, undefined);
  assert.equal(u.fn, undefined);
  assert.equal(u.ln, undefined);
});

test("страна проставляется всегда – магазин работает по Беларуси", () => {
  assert.equal(hashUserData({}).country, sha("by"));
});

test("покупка собирается с суммой, составом и временем оплаты", () => {
  const at = new Date("2026-09-23T12:00:00Z");
  const e = buildPurchaseEvent({
    orderId: 18,
    value: 154.4,
    lines: [
      { id: "7", quantity: 1, itemPrice: 60 },
      { id: "12", quantity: 2, itemPrice: 47.2 },
    ],
    user: { phone: "375292492851" },
    sourceUrl: "https://doza-parfum.by/cart",
    at,
  });

  assert.equal(e.event_name, "Purchase");
  assert.equal(e.event_id, "order-18");
  assert.equal(e.event_time, Math.floor(at.getTime() / 1000));
  assert.equal(e.action_source, "website", "действие было на сайте, а не у шлюза");

  const custom = e.custom_data as Record<string, unknown>;
  assert.equal(custom.currency, "BYN");
  assert.equal(custom.value, 154.4);
  assert.equal(custom.order_id, "18");
  assert.equal((custom.contents as unknown[]).length, 2);
});

test("сумма округляется до копеек, а не до рублей", () => {
  const e = buildPurchaseEvent({
    orderId: 1,
    value: 43.799999999999997,
    lines: [],
    user: {},
    sourceUrl: "https://doza-parfum.by",
  });
  assert.equal((e.custom_data as Record<string, unknown>).value, 43.8);
});

test("заказ, закрытый баллами целиком, уходит с нулём, а не с минусом", () => {
  const e = buildPurchaseEvent({
    orderId: 2,
    value: -5,
    lines: [],
    user: {},
    sourceUrl: "https://doza-parfum.by",
  });
  assert.equal((e.custom_data as Record<string, unknown>).value, 0);
});

test("дробное количество не уходит в Meta", () => {
  const e = buildPurchaseEvent({
    orderId: 3,
    value: 10,
    lines: [{ id: "5", quantity: 0, itemPrice: 10 }],
    user: {},
    sourceUrl: "https://doza-parfum.by",
  });
  const contents = (e.custom_data as Record<string, unknown>).contents as {
    quantity: number;
  }[];
  assert.equal(contents[0].quantity, 1, "меньше одной штуки не покупают");
});

test("адрес отправки собирается из версии и номера пикселя", () => {
  assert.match(capiUrl("123456789"), /graph\.facebook\.com\/v\d+\.\d+\/123456789\/events$/);
});
