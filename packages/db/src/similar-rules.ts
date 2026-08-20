/**
 * Подбор похожих ароматов.
 *
 * Чистая логика без БД: на вход — пирамиды нот, пол и цена, на выход — оценка
 * близости. Витрине нужна не случайная выборка «того же пола», а соседи, между
 * которыми покупателю есть смысл выбирать.
 */

export interface SimilarCandidate {
  id: number;
  brandId: number;
  gender: "male" | "female" | "unisex";
  notesTop?: string | null;
  notesMid?: string | null;
  notesBase?: string | null;
  /** Цена за 3 мл — по ней сравниваем ценовые лиги. */
  priceByn?: number | null;
}

/**
 * Слова, которые встречаются в половине пирамид и потому ничего не различают:
 * «древесные ноты» и «древесные ноты» — не сходство, а общее место.
 */
const STOP = new Set([
  "ноты",
  "нота",
  "аккорд",
  "абсолю",
  "масло",
  "эссенция",
  "экстракт",
  "нотки",
]);

/**
 * Разложить строку нот в набор слов.
 *
 * Сравниваем по словам, а не по целым фразам: «мускус» и «белый мускус» — это
 * про одно и то же, и терять такое совпадение нельзя. Слова короче четырёх
 * букв отбрасываем вместе с союзами.
 */
export function noteWords(notes?: string | null): Set<string> {
  if (!notes) return new Set();
  const words = notes
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9-]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return new Set(words);
}

/** Доля общих слов (коэффициент Жаккара). Пустые наборы — ноль, не единица. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

/**
 * Насколько два аромата близки по пирамиде.
 *
 * База весит больше верхних нот: верх выветривается за полчаса, а шлейф —
 * это то, чем аромат запомнится и с чем его будут сравнивать.
 */
export function notesScore(a: SimilarCandidate, b: SimilarCandidate): number {
  const top = overlap(noteWords(a.notesTop), noteWords(b.notesTop));
  const mid = overlap(noteWords(a.notesMid), noteWords(b.notesMid));
  const base = overlap(noteWords(a.notesBase), noteWords(b.notesBase));
  return (top * 1 + mid * 1.5 + base * 2) / 4.5;
}

/**
 * Совместимость по полу.
 *
 * Мужской и женский рядом не показываем совсем: подборка «похожих» — это
 * подсказка к покупке, а не справочник. Унисекс сочетается с обоими, но чуть
 * слабее, чем точное совпадение.
 */
export function genderScore(a: string, b: string): number | null {
  if (a === b) return 1;
  if (a === "unisex" || b === "unisex") return 0.6;
  return null;
}

/**
 * Близость ценовых лиг.
 *
 * Рядом с флаконом за 12 рублей нишевый за 125 выглядит издёвкой, даже если
 * ноты совпали. Считаем по отношению цен, а не по разнице: 12 и 24 — разные
 * лиги, 100 и 112 — одна и та же.
 */
export function priceScore(a?: number | null, b?: number | null): number {
  if (!a || !b || a <= 0 || b <= 0) return 0.5;
  const ratio = a > b ? a / b : b / a;
  if (ratio <= 1.35) return 1;
  if (ratio >= 4) return 0;
  return 1 - (ratio - 1.35) / (4 - 1.35);
}

/** Ниже этого порога сходство надуманное — лучше показать меньше соседей. */
export const MIN_SCORE = 0.12;

/**
 * Итоговая оценка. `null` — товары несопоставимы и рядом стоять не должны.
 */
export function similarityScore(
  a: SimilarCandidate,
  b: SimilarCandidate,
): number | null {
  if (a.id === b.id) return null;
  const gender = genderScore(a.gender, b.gender);
  if (gender === null) return null;

  const notes = notesScore(a, b);
  // Ни одной общей ноты — не похожи, и точка. Пол, бренд и цена лишь уточняют
  // сходство пирамид, но сами по себе его не создают: иначе в «похожих»
  // окажется любой мужской аромат той же марки, и подборка снова превратится
  // в случайную выборку, от которой мы и уходим.
  if (notes === 0) return null;

  const price = priceScore(a.priceByn, b.priceByn);
  // Один и тот же дом — слабый, но честный сигнал: у марки есть почерк, и
  // покупатели действительно перебирают линейку целиком.
  const brand = a.brandId === b.brandId ? 1 : 0;

  return notes * 0.6 + gender * 0.15 + price * 0.15 + brand * 0.1;
}

export interface RankedSimilar {
  id: number;
  score: number;
}

/**
 * Выбрать до `limit` ближайших к `product` из `pool`.
 *
 * При равных оценках порядок задаёт id — иначе один и тот же запуск давал бы
 * разный результат, и диффы каталога было бы не прочитать.
 */
export function pickSimilar(
  product: SimilarCandidate,
  pool: SimilarCandidate[],
  limit = 4,
): RankedSimilar[] {
  const scored: RankedSimilar[] = [];
  for (const other of pool) {
    const score = similarityScore(product, other);
    if (score !== null && score >= MIN_SCORE) scored.push({ id: other.id, score });
  }
  scored.sort((x, y) => y.score - x.score || x.id - y.id);
  return scored.slice(0, limit);
}
