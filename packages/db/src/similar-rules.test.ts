/**
 * Тесты подбора похожих ароматов.
 * Запуск: node --test packages/db/src/similar-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noteWords,
  overlap,
  notesScore,
  genderScore,
  priceScore,
  similarityScore,
  pickSimilar,
  type SimilarCandidate,
} from "./similar-rules.ts";

let nextId = 1;
function p(over: Partial<SimilarCandidate> = {}): SimilarCandidate {
  return {
    id: nextId++,
    brandId: 100,
    gender: "unisex",
    notesTop: "",
    notesMid: "",
    notesBase: "",
    priceByn: 30,
    ...over,
  };
}

test("ноты разбираются на слова, мусорные отбрасываются", () => {
  const w = noteWords("Древесные ноты, белый мускус, амбра");
  assert.ok(w.has("древесные"));
  assert.ok(w.has("мускус"));
  assert.ok(w.has("амбра"));
  assert.ok(!w.has("ноты"), "«ноты» есть у половины каталога и ничего не различают");
});

test("ё приводится к е, регистр не важен", () => {
  assert.ok(noteWords("Чёрная смородина").has("черная"));
  assert.ok(noteWords("ЧЕРНАЯ СМОРОДИНА").has("черная"));
});

test("«мускус» и «белый мускус» считаются частично общими", () => {
  // Сравнение по целым фразам потеряло бы это совпадение.
  const score = overlap(noteWords("мускус"), noteWords("белый мускус"));
  assert.ok(score > 0 && score < 1, `ожидали частичное совпадение, получили ${score}`);
});

test("пустые пирамиды не считаются одинаковыми", () => {
  assert.equal(overlap(new Set(), new Set()), 0);
  assert.equal(notesScore(p(), p()), 0);
});

test("база весит больше верхних нот", () => {
  const a = p({ notesTop: "Бергамот", notesBase: "Сандал" });
  const общая_база = notesScore(a, p({ notesTop: "Лимон", notesBase: "Сандал" }));
  const общий_верх = notesScore(a, p({ notesTop: "Бергамот", notesBase: "Ваниль" }));
  assert.ok(
    общая_база > общий_верх,
    "шлейф определяет аромат сильнее, чем первые полчаса",
  );
});

test("мужское и женское рядом не показываем", () => {
  assert.equal(genderScore("male", "female"), null);
  assert.equal(similarityScore(p({ gender: "male" }), p({ gender: "female" })), null);
});

test("унисекс сочетается с обоими, но слабее точного совпадения", () => {
  assert.equal(genderScore("male", "male"), 1);
  assert.ok(genderScore("male", "unisex") < 1);
  assert.ok(genderScore("male", "unisex") > 0);
});

test("цены одной лиги — единица, разных — ноль", () => {
  assert.equal(priceScore(100, 112), 1);
  assert.equal(priceScore(12, 125), 0, "12 и 125 рублей рядом не ставим");
  const средне = priceScore(30, 75);
  assert.ok(средне > 0 && средне < 1);
});

test("без цены оценка не обнуляется", () => {
  // Товар мог быть заведён руками и без цены за 3 мл — это не повод
  // выбрасывать его из подборки совсем.
  assert.equal(priceScore(null, 50), 0.5);
});

test("сам себе не похож", () => {
  const x = p();
  assert.equal(similarityScore(x, x), null);
});

test("совпадение нот важнее совпадения бренда", () => {
  const base = p({ brandId: 1, notesBase: "Ваниль, бобы тонка" });
  const свой_бренд_другие_ноты = similarityScore(
    base,
    p({ brandId: 1, notesBase: "Морская соль, водоросли" }),
  );
  const чужой_бренд_те_же_ноты = similarityScore(
    base,
    p({ brandId: 2, notesBase: "Ваниль, бобы тонка" }),
  );
  assert.ok(чужой_бренд_те_же_ноты > свой_бренд_другие_ноты);
});

test("подборка ограничена и отсортирована по близости", () => {
  const target = p({ notesBase: "Ваниль, сандал", priceByn: 40 });
  const pool = [
    p({ notesBase: "Ваниль, сандал", priceByn: 40 }),
    p({ notesBase: "Ваниль, кедр", priceByn: 40 }),
    p({ notesBase: "Ваниль, сандал, амбра", priceByn: 40 }),
  ];
  const got = pickSimilar(target, pool, 2);
  assert.equal(got.length, 2);
  assert.ok(got[0].score >= got[1].score);
});

test("без общих нот не похожи, даже если совпали пол и бренд", () => {
  // Иначе в «похожих» оказался бы любой мужской аромат той же марки — ровно
  // та случайная выборка, от которой мы уходим.
  const a = p({ brandId: 7, gender: "male", notesBase: "Кожа, табак" });
  const b = p({ brandId: 7, gender: "male", notesBase: "Морская соль" });
  assert.equal(similarityScore(a, b), null);
});

test("совсем далёкие в подборку не попадают", () => {
  const target = p({ gender: "male", notesBase: "Кожа, табак", priceByn: 12 });
  const далёкий = p({ gender: "male", notesBase: "Морская соль", priceByn: 125 });
  assert.deepEqual(pickSimilar(target, [далёкий]), []);
});

test("порядок устойчив: равные оценки разводятся по id", () => {
  const target = p({ notesBase: "Ваниль" });
  const pool = [p({ id: 900, notesBase: "Ваниль" }), p({ id: 800, notesBase: "Ваниль" })];
  const first = pickSimilar(target, pool).map((r) => r.id);
  const second = pickSimilar(target, [...pool].reverse()).map((r) => r.id);
  assert.deepEqual(first, second, "результат не должен зависеть от порядка входа");
  assert.deepEqual(first, [800, 900]);
});
