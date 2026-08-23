/**
 * Тесты расстояний.
 * Запуск: node --test packages/shared/src/geo.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, formatDistance } from "./geo.ts";

const MINSK = { lat: 53.9023, lng: 27.5619 };
const NOVOPOLOTSK = { lat: 55.5372, lng: 28.6531 };
const BREST = { lat: 52.0976, lng: 23.7341 };

test("до самого себя — ноль", () => {
  assert.equal(distanceKm(MINSK, MINSK), 0);
});

test("расстояния сходятся с картой", () => {
  // По прямой, а не по дороге: Минск — Новополоцк около 195 км,
  // Минск — Брест около 325 км (по трассе будет заметно больше).
  assert.ok(Math.abs(distanceKm(MINSK, NOVOPOLOTSK) - 195) < 10);
  assert.ok(Math.abs(distanceKm(MINSK, BREST) - 325) < 10);
});

test("направление не важно", () => {
  assert.equal(
    distanceKm(MINSK, BREST).toFixed(6),
    distanceKm(BREST, MINSK).toFixed(6),
  );
});

test("градус долготы короче градуса широты", () => {
  // На широте Беларуси — почти вдвое. Наивная разница координат считала бы их
  // одинаковыми, и ближайшее отделение оказалось бы не тем.
  const поШироте = distanceKm(MINSK, { lat: MINSK.lat + 1, lng: MINSK.lng });
  const поДолготе = distanceKm(MINSK, { lat: MINSK.lat, lng: MINSK.lng + 1 });
  assert.ok(поШироте > поДолготе * 1.5, `${поШироте} против ${поДолготе}`);
});

test("соседние дома дают сотни метров, а не нули", () => {
  const рядом = distanceKm(MINSK, { lat: MINSK.lat + 0.005, lng: MINSK.lng });
  assert.ok(рядом > 0.4 && рядом < 0.7, String(рядом));
});

// ── Как показываем ──────────────────────────────────────────────────────────

test("до километра — метры", () => {
  assert.equal(formatDistance(0.8), "800 м");
  assert.equal(formatDistance(0.05), "50 м");
});

test("до десяти километров — с десятыми", () => {
  assert.equal(formatDistance(3.42), "3,4 км");
  assert.equal(formatDistance(1), "1,0 км");
});

test("дальше — целые километры", () => {
  assert.equal(formatDistance(120.4), "120 км");
  assert.equal(formatDistance(10), "10 км");
});
