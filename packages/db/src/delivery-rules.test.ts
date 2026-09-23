/**
 * Тесты стоимости доставки и порога бесплатной.
 * Запуск: node --test packages/db/src/delivery-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_FEE,
  FREE_DELIVERY_FROM,
  EXPRESS_FEE,
  canExpress,
  deliveryCost,
  freeDeliveryHint,
  isPostDelivery,
  needsPostalAddress,
  needsOffice,
} from "./delivery-rules.ts";

test("самовывоз ничего не стоит", () => {
  const c = deliveryCost({ type: "pickup", goodsTotal: 5 });
  assert.equal(c.fee, 0);
  assert.equal(c.free, true);
  assert.equal(freeDeliveryHint(c), null, "при самовывозе уговаривать не о чем");
});

test("почта дешевле порога стоит 10 рублей", () => {
  for (const type of ["belpochta", "europost"] as const) {
    const c = deliveryCost({ type, goodsTotal: 55 });
    assert.equal(c.fee, DELIVERY_FEE, type);
    assert.equal(c.free, false, type);
  }
});

test("от порога доставка бесплатна", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: FREE_DELIVERY_FROM });
  assert.equal(c.fee, 0);
  assert.equal(c.free, true);
  assert.equal(freeDeliveryHint(c), null, "уже бесплатно – молчим");
});

test("ровно на копейку ниже порога – платно", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: FREE_DELIVERY_FROM - 0.01 });
  assert.equal(c.fee, DELIVERY_FEE);
  assert.equal(c.missingForFree, 0.01);
});

test("подсказка называет, сколько не хватает", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: 55 });
  assert.equal(c.missingForFree, 45);
  assert.match(freeDeliveryHint(c), /45\.00/);
});

test("копейки в подсказке не размножаются", () => {
  const c = deliveryCost({ type: "europost", goodsTotal: 33.33 });
  assert.equal(c.missingForFree, 66.67);
});

test("пустая корзина не даёт отрицательных сумм", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: 0 });
  assert.equal(c.missingForFree, FREE_DELIVERY_FROM);
  assert.equal(c.fee, DELIVERY_FEE);
});

test("отрицательная сумма трактуется как ноль", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: -50 });
  assert.equal(c.missingForFree, FREE_DELIVERY_FROM);
});

// ── Какие поля спрашивать ───────────────────────────────────────────────────

test("почтой – да, самовывозом – нет", () => {
  assert.equal(isPostDelivery("pickup"), false);
  assert.equal(isPostDelivery("belpochta"), true);
  assert.equal(isPostDelivery("europost"), true);
});

test("Белпочте нужен адрес, Европочте – отделение", () => {
  // У Европочты посылку забирают в отделении, улица там ни к чему.
  assert.equal(needsPostalAddress("belpochta"), true);
  assert.equal(needsOffice("belpochta"), false);

  assert.equal(needsPostalAddress("europost"), false);
  assert.equal(needsOffice("europost"), true);
});

test("самовывозу не нужно ни то ни другое", () => {
  assert.equal(needsPostalAddress("pickup"), false);
  assert.equal(needsOffice("pickup"), false);
});

test("старые заказы «почтой» считаются адресными", () => {
  // Значение осталось в базе от времён, когда почта была одна.
  assert.equal(needsPostalAddress("post"), true);
  assert.equal(isPostDelivery("post"), true);
});

// ── Экспресс EMS ────────────────────────────────────────────────────────────

test("экспресс возит только Белпочта", () => {
  // EMS – услуга Белпочты. У Европочты своя сеть, у самовывоза нет посылки.
  assert.equal(canExpress("belpochta"), true);
  assert.equal(canExpress("europost"), false);
  assert.equal(canExpress("pickup"), false);
});

test("экспресс заменяет обычную доставку, а не добавляется к ней", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: 55, express: true });
  assert.equal(c.fee, EXPRESS_FEE, "платят цену экспресса, а не 15 + 10");
  assert.equal(c.express, true);
  assert.equal(c.free, false);
});

test("порог бесплатной доставки на экспресс не распространяется", () => {
  // Иначе заказ на 150 рублей уехал бы срочным за ноль: бесплатной срочной
  // отправки не бывает.
  const c = deliveryCost({
    type: "belpochta",
    goodsTotal: FREE_DELIVERY_FROM + 50,
    express: true,
  });
  assert.equal(c.fee, EXPRESS_FEE);
  assert.equal(c.free, false);
});

test("экспресс не молчит про подсказку, а снимает её", () => {
  const c = deliveryCost({ type: "belpochta", goodsTotal: 10, express: true });
  assert.equal(c.missingForFree, 0);
  assert.equal(freeDeliveryHint(c), null, "добирать до бесплатной незачем");
});

test("галочка экспресса у Европочты не действует", () => {
  // Форма прячет её, но запрос в браузере правят руками: считаем как обычную.
  const c = deliveryCost({ type: "europost", goodsTotal: 55, express: true });
  assert.equal(c.fee, DELIVERY_FEE);
  assert.equal(c.express, false);
});

test("галочка экспресса при самовывозе ничего не стоит", () => {
  const c = deliveryCost({ type: "pickup", goodsTotal: 55, express: true });
  assert.equal(c.fee, 0);
  assert.equal(c.express, false);
});

test("без галочки Белпочта считается по-старому", () => {
  const cheap = deliveryCost({ type: "belpochta", goodsTotal: 55 });
  assert.equal(cheap.fee, DELIVERY_FEE);
  assert.equal(cheap.express, false);

  const free = deliveryCost({ type: "belpochta", goodsTotal: FREE_DELIVERY_FROM });
  assert.equal(free.fee, 0);
  assert.equal(free.express, false);
});
