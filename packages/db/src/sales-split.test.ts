/**
 * Тесты разделения выручки между продавцами.
 * Запуск: node --test packages/db/src/sales-split.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySalesSplits,
  validateShares,
  type SplittableSale,
} from "./sales-split.ts";

const sale = (sellerId: number, day: string, totalByn: number): SplittableSale => ({
  sellerId,
  day,
  totalByn,
});

test("без правил всё остаётся на своих продавцах", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 100), sale(2, "2026-08-01", 50)],
    [],
  );
  assert.deepEqual(r, [
    { sellerId: 1, sum: 100, count: 1 },
    { sellerId: 2, sum: 50, count: 1 },
  ]);
});

test("50/50 делит выручку дня пополам", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 600), sale(1, "2026-08-01", 400)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 50 },
          { sellerId: 2, percent: 50 },
        ],
      },
    ],
  );
  const map = new Map(r.map((x) => [x.sellerId, x.sum]));
  assert.equal(map.get(1), 500);
  assert.equal(map.get(2), 500);
});

test("60/40 считает доли верно", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 1000)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 60 },
          { sellerId: 2, percent: 40 },
        ],
      },
    ],
  );
  const map = new Map(r.map((x) => [x.sellerId, x.sum]));
  assert.equal(map.get(1), 600);
  assert.equal(map.get(2), 400);
});

test("сумма долей всегда равна сумме чеков (копейки не теряются)", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 33.33), sale(1, "2026-08-01", 66.67)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 33 },
          { sellerId: 2, percent: 67 },
        ],
      },
    ],
  );
  const total = Math.round(r.reduce((s, x) => s + x.sum, 0) * 100) / 100;
  assert.equal(total, 100);
});

test("правило действует только на свой день", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 100), sale(1, "2026-08-02", 200)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 50 },
          { sellerId: 2, percent: 50 },
        ],
      },
    ],
  );
  const map = new Map(r.map((x) => [x.sellerId, x.sum]));
  // 50 из первого дня + 200 из второго
  assert.equal(map.get(1), 250);
  assert.equal(map.get(2), 50);
});

test("правило действует только на свой аккаунт", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 100), sale(3, "2026-08-01", 300)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 50 },
          { sellerId: 2, percent: 50 },
        ],
      },
    ],
  );
  const map = new Map(r.map((x) => [x.sellerId, x.sum]));
  assert.equal(map.get(3), 300, "продажи другого аккаунта не тронуты");
  assert.equal(map.get(1), 50);
  assert.equal(map.get(2), 50);
});

test("делить можно на троих", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 900)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 50 },
          { sellerId: 2, percent: 30 },
          { sellerId: 3, percent: 20 },
        ],
      },
    ],
  );
  const map = new Map(r.map((x) => [x.sellerId, x.sum]));
  assert.equal(map.get(1), 450);
  assert.equal(map.get(2), 270);
  assert.equal(map.get(3), 180);
});

test("чек засчитывается продавцу с большей долей и не дробится", () => {
  const r = applySalesSplits(
    [sale(1, "2026-08-01", 100), sale(1, "2026-08-01", 100)],
    [
      {
        day: "2026-08-01",
        sourceSellerId: 1,
        shares: [
          { sellerId: 1, percent: 30 },
          { sellerId: 2, percent: 70 },
        ],
      },
    ],
  );
  const map = new Map(r.map((x) => [x.sellerId, x]));
  assert.equal(map.get(2)!.count, 2, "оба чека у продавца с долей 70%");
  assert.equal(map.get(1)!.count, 0);
});

test("общая выручка не меняется после разделения", () => {
  const sales = [
    sale(1, "2026-08-01", 123.45),
    sale(1, "2026-08-01", 67.89),
    sale(2, "2026-08-01", 10),
  ];
  const before = Math.round(sales.reduce((s, x) => s + x.totalByn, 0) * 100) / 100;
  const r = applySalesSplits(sales, [
    {
      day: "2026-08-01",
      sourceSellerId: 1,
      shares: [
        { sellerId: 1, percent: 45 },
        { sellerId: 2, percent: 55 },
      ],
    },
  ]);
  const after = Math.round(r.reduce((s, x) => s + x.sum, 0) * 100) / 100;
  assert.equal(after, before);
});

// ── Валидация долей ─────────────────────────────────────────────────────────

test("доли обязаны давать 100%", () => {
  assert.equal(
    validateShares([
      { sellerId: 1, percent: 50 },
      { sellerId: 2, percent: 50 },
    ]),
    null,
  );
  assert.match(
    validateShares([
      { sellerId: 1, percent: 50 },
      { sellerId: 2, percent: 30 },
    ])!,
    /100%/,
  );
});

test("нужно минимум два продавца", () => {
  assert.match(validateShares([{ sellerId: 1, percent: 100 }])!, /двух/);
});

test("один продавец не может быть указан дважды", () => {
  assert.match(
    validateShares([
      { sellerId: 1, percent: 50 },
      { sellerId: 1, percent: 50 },
    ])!,
    /дважды/,
  );
});
