import { useEffect, useMemo, useRef, useState } from "react";
import type { FinderProduct, Gender } from "../lib/types";
import { GENDER_LABELS } from "../lib/types";

interface Props {
  products: FinderProduct[];
}

type Intent = "self" | "gift";
type GenderChoice = Gender | "any";
type Knowledge = "reference" | "directions" | "unknown";
type FamilyId = "fresh" | "woody" | "sweet" | "floral" | "spicy";
type MoodId = "clean" | "cozy" | "elegant" | "bold" | "sensual";
type OccasionId = "everyday" | "work" | "meetings" | "evening" | "versatile";
type IntensityId = "soft" | "moderate" | "noticeable" | "any";
type TieBreak = "direction" | "occasion" | "equal";

interface Answers {
  intent: Intent | null;
  gender: GenderChoice | null;
  knowledge: Knowledge | null;
  referenceId: number | null;
  referenceSearch: string;
  families: FamilyId[];
  safeFamily: FamilyId | "any" | null;
  avoid: FamilyId[];
  mood: MoodId | null;
  occasion: OccasionId | null;
  intensity: IntensityId | null;
  season: "warm" | "cool" | "any" | null;
  tieBreak: TieBreak | null;
}

const INITIAL_ANSWERS: Answers = {
  intent: null,
  gender: null,
  knowledge: null,
  referenceId: null,
  referenceSearch: "",
  families: [],
  safeFamily: null,
  avoid: [],
  mood: null,
  occasion: null,
  intensity: null,
  season: null,
  tieBreak: null,
};

const FAMILIES: { id: FamilyId; label: string; keywords: string[] }[] = [
  { id: "fresh", label: "Свежие", keywords: ["цитрус", "бергамот", "лимон", "морск", "водн", "мят", "зелён", "зелен", "нероли", "грейпфрут", "лайм", "мандарин", "апельсин", "розмарин", "акват", "озон"] },
  { id: "woody", label: "Древесные", keywords: ["сандал", "кедр", "уд", "ветивер", "дерев", "пачули", "мох", "сосн", "можжевел", "ветив", "кож"] },
  { id: "sweet", label: "Сладкие", keywords: ["ваниль", "карамель", "пралине", "шоколад", "какао", "тонка", "мёд", "мед", "сахар", "гурман", "груша", "ирис", "фрукт", "ягод", "боб"] },
  { id: "floral", label: "Цветочные", keywords: ["роза", "жасмин", "цветок", "цвет", "пион", "фиалк", "флёрдоранж", "флердоранж", "ландыш", "лаванд", "тубероз", "магнол", "фрез", "ирис"] },
  { id: "spicy", label: "Пряные", keywords: ["амбр", "специ", "перец", "кардамон", "корица", "ладан", "табак", "кожа", "восточн", "прян", "ром", "шафран", "гвоздик", "имбирь", "мускат"] },
];

const MOODS: { id: MoodId; label: string; families: FamilyId[] }[] = [
  { id: "clean", label: "Чистый и свежий", families: ["fresh"] },
  { id: "cozy", label: "Мягкий и уютный", families: ["sweet", "woody"] },
  { id: "elegant", label: "Элегантный", families: ["floral", "woody"] },
  { id: "bold", label: "Яркий и уверенный", families: ["spicy", "woody"] },
  { id: "sensual", label: "Чувственный и глубокий", families: ["sweet", "spicy"] },
];

const OCCASIONS: { id: OccasionId; label: string; families: FamilyId[] }[] = [
  { id: "everyday", label: "На каждый день", families: ["fresh", "floral"] },
  { id: "work", label: "На работу или учёбу", families: ["fresh", "woody"] },
  { id: "meetings", label: "На прогулки и встречи", families: ["fresh", "floral", "sweet"] },
  { id: "evening", label: "На вечер и особые случаи", families: ["woody", "spicy", "sweet"] },
  { id: "versatile", label: "Для разных случаев", families: ["fresh", "woody", "floral"] },
];

const PROFILE_KEYWORDS: Record<"soft" | "noticeable" | "warm" | "cool", string[]> = {
  soft: ["мускус", "белый мускус", "чай", "пудр", "ирис", "лаванд", "мягк", "лёгк", "легк", "свеж", "чист"],
  noticeable: ["уд", "амбра", "амброксан", "табак", "кожа", "ладан", "шафран", "специ", "насыщ", "ярк", "шлейф", "восточн"],
  warm: ["ваниль", "амбра", "табак", "корица", "кожа", "пачули", "сандал", "тонка", "прян", "тёпл", "тепл"],
  cool: ["цитрус", "бергамот", "лимон", "морск", "мят", "зелён", "зелен", "водн", "грейпфрут", "нероли", "свеж"],
};

const GENDER_OPTIONS: { value: GenderChoice; label: string }[] = [
  { value: "female", label: "Женские" },
  { value: "male", label: "Мужские" },
  { value: "unisex", label: "Унисекс" },
  { value: "any", label: "Не важно" },
];

const FAMILY_LABEL = Object.fromEntries(FAMILIES.map((family) => [family.id, family.label])) as Record<FamilyId, string>;

function hasAny(text: string, keywords: string[]) {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  return keywords.some((rawKeyword) => {
    const keyword = rawKeyword.toLowerCase().replace(/ё/g, "е");
    if (keyword.length > 3) return normalized.includes(keyword);
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-zа-я])${escaped}(?:$|[^a-zа-я])`, "i").test(normalized);
  });
}

function familyMatches(product: FinderProduct, family: FamilyId) {
  return hasAny(product.notes, FAMILIES.find((item) => item.id === family)!.keywords);
}

function productNotes(product: FinderProduct) {
  return [product.notesTop, product.notesMid, product.notesBase].filter(Boolean).join(" · ");
}

function genderFit(product: FinderProduct, preference: GenderChoice | null) {
  if (!preference || preference === "any") return 1;
  if (product.gender === preference) return 1;
  if (product.gender === "unisex") return 0.72;
  return 0;
}

function rankProducts(products: FinderProduct[], answers: Answers) {
  const excluded = new Set(answers.avoid);
  const requestedFamilies = new Set<FamilyId>(answers.families);
  if (answers.safeFamily && answers.safeFamily !== "any") requestedFamilies.add(answers.safeFamily);
  for (const family of MOODS.find((item) => item.id === answers.mood)?.families ?? []) requestedFamilies.add(family);
  const occasionFamilies = OCCASIONS.find((item) => item.id === answers.occasion)?.families ?? [];

  const reference = products.find((product) => product.id === answers.referenceId);
  const candidatePool = products
    .map((product) => {
      const gender = genderFit(product, answers.gender);
      if (gender === 0) return null;
      if (product.id === answers.referenceId) return null;

      let score = gender * 1.5;
      const matchedFamilies: FamilyId[] = [];
      for (const family of requestedFamilies) {
        if (familyMatches(product, family)) {
          score += answers.families.includes(family) || answers.safeFamily === family ? 3 : 1.35;
          matchedFamilies.push(family);
        }
      }
      for (const family of occasionFamilies) {
        if (familyMatches(product, family)) {
          score += 0.55;
          if (!matchedFamilies.includes(family)) matchedFamilies.push(family);
        }
      }

      const avoidedFamilies = [...excluded].filter((family) => familyMatches(product, family));
      score -= avoidedFamilies.length * 3.5;

      if (reference && reference.id !== product.id) {
        if (reference.similarIds.includes(product.id)) score += 6;
        const common = FAMILIES.filter((family) => familyMatches(reference, family.id) && familyMatches(product, family.id)).length;
        score += common * 0.8;
      } else if (reference?.id === product.id) {
        score -= 2;
      }

      const searchable = `${product.notes} ${product.description ?? ""}`;
      if (answers.intensity === "soft" && hasAny(searchable, PROFILE_KEYWORDS.soft)) score += 0.8;
      if (answers.intensity === "noticeable" && hasAny(searchable, PROFILE_KEYWORDS.noticeable)) score += 0.8;
      if (answers.season === "warm" && hasAny(searchable, PROFILE_KEYWORDS.warm)) score += 0.65;
      if (answers.season === "cool" && hasAny(searchable, PROFILE_KEYWORDS.cool)) score += 0.65;
      if (answers.tieBreak === "direction" && matchedFamilies.length) score += 0.5;
      if (answers.tieBreak === "occasion") {
        score += matchedFamilies.some((family) => occasionFamilies.includes(family)) ? 0.5 : 0;
      }

      return { product, score, matchedFamilies, avoidedFamilies };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id);

  const goodFits = candidatePool.filter((entry) => entry.avoidedFamilies.length === 0 && entry.score > 1.5);
  const fallbackFits = candidatePool.filter((entry) => entry.avoidedFamilies.length === 0);
  return (goodFits.length ? goodFits : fallbackFits).slice(0, 6).map(({ product, matchedFamilies }) => {
    const reasons: string[] = [];
    if (reference && reference.id !== product.id && reference.similarIds.includes(product.id)) {
      reasons.push(`Похож на ${reference.brand} ${reference.name}`);
    }
    const answerFamilies = [...new Set([...answers.families, ...(answers.safeFamily && answers.safeFamily !== "any" ? [answers.safeFamily] : [])])];
    for (const family of answerFamilies) {
      if (familyMatches(product, family)) reasons.push(`Есть любимые ${FAMILY_LABEL[family].toLowerCase()} ноты`);
    }
    if (reasons.length === 0 && matchedFamilies.length) reasons.push(`Подходит по характеру: ${matchedFamilies.map((family) => FAMILY_LABEL[family].toLowerCase()).join(", ")}`);
    if (reasons.length === 0) reasons.push("Подходит выбранной категории и доступен в каталоге");
    return { product, reasons: reasons.slice(0, 2) };
  });
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
      <path d="m4 10.5 4 4 8-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 ${direction === "left" ? "rotate-180" : ""}`} fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

export default function FinderApp({ products }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(INITIAL_ANSWERS);
  const [done, setDone] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === 0 || done) return;
    questionRef.current?.focus({ preventScroll: true });
    questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [done, step]);

  function update<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "tieBreak" ? {} : { tieBreak: null }),
    }));
  }

  function chooseIntent(intent: Intent) {
    setAnswers({ ...INITIAL_ANSWERS, intent });
  }

  function chooseKnowledge(knowledge: Knowledge) {
    setAnswers((previous) => ({
      ...previous,
      knowledge,
      referenceId: null,
      referenceSearch: "",
      families: [],
      safeFamily: null,
      tieBreak: null,
    }));
  }

  function toggle<K extends "families" | "avoid">(key: K, value: FamilyId) {
    setAnswers((previous) => ({
      ...previous,
      tieBreak: null,
      [key]: previous[key].includes(value)
        ? previous[key].filter((item) => item !== value)
        : [...previous[key], value],
    }));
  }

  const referenceResults = useMemo(() => {
    const query = answers.referenceSearch.trim().toLowerCase();
    if (!query) return [];
    return products
      .filter((product) => `${product.brand} ${product.name}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [answers.referenceSearch, products]);

  const results = useMemo(() => (done ? rankProducts(products, answers) : []), [answers, done, products]);

  const tieFocus = useMemo(() => {
    const selectedFamily = answers.families[0] ?? answers.safeFamily;
    if (selectedFamily && selectedFamily !== "any") {
      return {
        direction: `направление «${FAMILY_LABEL[selectedFamily].toLowerCase()}»`,
        occasion: OCCASIONS.find((item) => item.id === answers.occasion)?.label.toLowerCase() ?? "повседневное использование",
      };
    }
    return {
      direction: MOODS.find((item) => item.id === answers.mood)?.label.toLowerCase() ?? "выбранное настроение",
      occasion: OCCASIONS.find((item) => item.id === answers.occasion)?.label.toLowerCase() ?? "универсальность",
    };
  }, [answers.families, answers.mood, answers.occasion, answers.safeFamily]);

  function next() {
    if (step < 9) setStep((current) => current + 1);
    else setDone(true);
  }

  function restart() {
    setStep(0);
    setAnswers(INITIAL_ANSWERS);
    setDone(false);
  }

  const canContinue = (() => {
    switch (step) {
      case 0: return answers.intent !== null;
      case 1: return answers.gender !== null;
      case 2: return answers.knowledge !== null;
      case 3: return answers.knowledge === "reference" ? answers.referenceId !== null : answers.knowledge === "directions" ? answers.families.length > 0 : answers.safeFamily !== null;
      case 5: return answers.mood !== null;
      case 6: return answers.occasion !== null;
      case 7: return answers.intensity !== null;
      case 8: return answers.season !== null;
      case 9: return answers.tieBreak !== null;
      default: return true;
    }
  })();

  function optionButton(label: string, selected: boolean, onClick: () => void, description?: string) {
    return (
      <button
        key={label}
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={`group flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 rounded-xl border px-5 py-4 text-left text-base transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${selected ? "border-gold-400 bg-gold-500/10 text-ivory" : "border-ink-600 bg-ink-800/70 text-ivory-muted hover:border-gold-600/70 hover:text-ivory"}`}
      >
        <span>
          <span className="block">{label}</span>
          {description && <span className="mt-1 block text-sm leading-relaxed text-ivory-faint">{description}</span>}
        </span>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? "border-gold-400 bg-gold-400 text-ink-900" : "border-ink-600 text-transparent group-hover:border-gold-600/70"}`}>
          {selected ? <CheckIcon /> : <span className="sr-only">Не выбрано</span>}
        </span>
      </button>
    );
  }

  const title = [
    "Для кого выбираем аромат?",
    "Какой тип аромата подбираем?",
    answers.intent === "gift" ? "Насколько хорошо вы знаете его вкус?" : "Есть аромат, который вам особенно нравится?",
    answers.knowledge === "reference" ? "Выберите аромат, который возьмём за ориентир" : answers.knowledge === "directions" ? "Какие направления нравятся?" : "Какое направление кажется наиболее универсальным?",
    answers.referenceId
      ? `Чего лучше избегать в ароматах, похожих на ${products.find((product) => product.id === answers.referenceId)?.name ?? "него"}?`
      : "Чего лучше избегать?",
    answers.intent === "gift" ? "Какое впечатление должен создавать аромат у получателя?" : "Какое впечатление должен создавать аромат?",
    answers.mood ? `Где будет уместен аромат с характером «${MOODS.find((mood) => mood.id === answers.mood)?.label.toLowerCase()}»?` : "Где его будут носить чаще?",
    answers.intent === "gift" ? "Насколько заметным должен быть аромат для получателя?" : "Насколько заметным должен быть аромат?",
    answers.intent === "gift" ? "Когда получатель будет носить аромат чаще?" : "Когда вы будете носить аромат чаще?",
    "Что поставить выше при выборе?",
  ][step];

  if (done) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 border-b border-ink-600/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-gold-500">Ваш подбор DOZA</p>
            <h2 className="font-serif text-3xl text-ivory sm:text-4xl">Ароматы под ваш вкус</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ivory-muted">Мы сопоставили ваши ответы с нотами и характеристиками ароматов в каталоге.</p>
          </div>
          <button type="button" onClick={restart} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-gold-500/60 px-5 text-sm text-gold-300 transition-colors hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 sm:self-auto">
            Пройти заново
          </button>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-ink-600 bg-ink-800 px-6 py-12 text-center">
            <h3 className="font-serif text-2xl text-ivory">Пока не нашли подходящих ароматов</h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ivory-muted">Попробуйте изменить ответы или откройте весь каталог.</p>
            <a href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-gold-gradient px-6 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90">Открыть каталог</a>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
            {results.map(({ product, reasons }, index) => (
              <a key={product.id} href={`/product/${product.slug}`} className="group block overflow-hidden rounded-2xl border border-ink-600/70 bg-ink-700 transition-colors duration-200 hover:border-gold-500/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300">
                <div className="relative aspect-[3/4] overflow-hidden bg-ink-900">
                  <img src={product.image} alt={`${product.brand} ${product.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                  <span className="absolute left-3 top-3 rounded-full border border-gold-500/30 bg-ink-900/85 px-3 py-1 text-xs text-gold-300">{index === 0 ? "Наилучшее совпадение" : GENDER_LABELS[product.gender]}</span>
                </div>
                <div className="space-y-3 p-4 sm:p-5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-luxe text-gold-500">{product.brand}</p>
                    <h3 className="mt-1 font-serif text-xl leading-tight text-ivory sm:text-2xl">{product.name}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-ivory-muted">{reasons[0]}</p>
                  {productNotes(product) && <p className="line-clamp-2 text-xs leading-relaxed text-ivory-faint">{productNotes(product)}</p>}
                  <span className="block text-sm font-medium text-gold-300">от {byn(product.priceFrom)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
        <div className="mt-8 text-center">
          <a href="/" className="inline-flex min-h-11 items-center rounded-full border border-gold-500/70 px-6 text-sm text-gold-300 transition-colors hover:bg-gold-500/10">Смотреть весь каталог</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-7 flex items-center justify-between text-sm">
        <span className="text-ivory-muted">Шаг {step + 1} из 10</span>
        <span className="text-gold-300">{(step + 1) * 10}%</span>
      </div>
      <div className="mb-9 h-1.5 overflow-hidden rounded-full bg-ink-600" role="progressbar" aria-label="Прогресс подбора аромата" aria-valuemin={0} aria-valuemax={10} aria-valuenow={step + 1}>
        <div className="h-full rounded-full bg-gold-gradient transition-[width] duration-300" style={{ width: `${(step + 1) * 10}%` }} />
      </div>

      <section className="rounded-2xl border border-ink-600/80 bg-ink-800/70 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.18)] sm:p-8" aria-labelledby="finder-question">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gold-500">Подбор по вашим предпочтениям</p>
        <h2 ref={questionRef} id="finder-question" tabIndex={-1} aria-live="polite" className="mb-6 font-serif text-3xl leading-tight text-ivory focus:outline-none sm:text-4xl">{title}</h2>

        <div className="space-y-3">
          {step === 0 && <>
            {optionButton("Для себя", answers.intent === "self", () => chooseIntent("self"))}
            {optionButton("В подарок", answers.intent === "gift", () => chooseIntent("gift"))}
          </>}

          {step === 1 && <>
            <p className="mb-4 text-sm leading-relaxed text-ivory-muted">{answers.intent === "gift" ? "Если не знаете категорию — выбирайте «Не знаю», это не помешает подбору." : "Если нет предпочтений, оставьте выбор открытым."}</p>
            {GENDER_OPTIONS.map((option) => optionButton(option.value === "any" && answers.intent === "gift" ? "Не знаю" : option.label, answers.gender === option.value, () => update("gender", option.value)))}
          </>}

          {step === 2 && <>
            {optionButton("Знаю конкретный аромат", answers.knowledge === "reference", () => chooseKnowledge("reference"), "Возьмём его как отправную точку")}
            {optionButton("Могу описать, что нравится", answers.knowledge === "directions", () => chooseKnowledge("directions"), "Например: свежие, цветочные или древесные")}
            {optionButton("Пока не знаю", answers.knowledge === "unknown", () => chooseKnowledge("unknown"), "Это не помешает пройти подбор")}
          </>}

          {step === 3 && answers.knowledge === "reference" && <>
            <label htmlFor="reference-search" className="mb-2 block text-sm text-ivory-muted">Начните вводить бренд или название</label>
            <input id="reference-search" type="search" value={answers.referenceSearch} onChange={(event) => {
              const value = event.target.value;
              setAnswers((previous) => ({ ...previous, referenceSearch: value, referenceId: null, tieBreak: null }));
            }} placeholder="Например, Dior Sauvage" className="min-h-12 w-full rounded-xl border border-ink-600 bg-ink-900 px-4 text-base text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none" autoComplete="off" />
            {referenceResults.length > 0 && <div className="mt-3 space-y-2" role="group" aria-label="Найденные ароматы">
              {referenceResults.map((product) => optionButton(`${product.brand} ${product.name}`, answers.referenceId === product.id, () => update("referenceId", product.id), "Взять за ориентир"))}
            </div>}
            {answers.referenceSearch && referenceResults.length === 0 && <p className="mt-3 rounded-lg border border-ink-600 px-4 py-3 text-sm text-ivory-muted">Не нашли в каталоге. Можно вернуться и описать предпочтения словами.</p>}
          </>}

          {step === 3 && answers.knowledge === "directions" && <>
            <p className="mb-4 text-sm text-ivory-muted">Можно выбрать несколько.</p>
            {FAMILIES.map((family) => optionButton(family.label, answers.families.includes(family.id), () => toggle("families", family.id)))}
          </>}

          {step === 3 && answers.knowledge === "unknown" && <>
            <p className="mb-4 text-sm leading-relaxed text-ivory-muted">Выберите то, с чего было бы комфортно начать, или оставьте выбор открытым.</p>
            {FAMILIES.map((family) => optionButton(family.label, answers.safeFamily === family.id, () => update("safeFamily", family.id)))}
            {optionButton("Не знаю — покажите разные варианты", answers.safeFamily === "any", () => update("safeFamily", "any"))}
          </>}

          {step === 4 && <>
            <p className="mb-4 text-sm text-ivory-muted">Можно отметить несколько вариантов или выбрать «Ничего из этого».</p>
            {FAMILIES.map((family) => optionButton(`${family.label} ароматы`, answers.avoid.includes(family.id), () => toggle("avoid", family.id)))}
            {optionButton("Ничего из этого / не знаю", answers.avoid.length === 0, () => update("avoid", []))}
          </>}

          {step === 5 && <>{MOODS.map((mood) => optionButton(mood.label, answers.mood === mood.id, () => update("mood", mood.id)))}</>}
          {step === 6 && <>{OCCASIONS.map((occasion) => optionButton(occasion.label, answers.occasion === occasion.id, () => update("occasion", occasion.id)))}</>}
          {step === 7 && <>
            {optionButton("Лёгкий, близко к коже", answers.intensity === "soft", () => update("intensity", "soft"))}
            {optionButton("Умеренный", answers.intensity === "moderate", () => update("intensity", "moderate"))}
            {optionButton("Яркий и заметный", answers.intensity === "noticeable", () => update("intensity", "noticeable"))}
            {optionButton("Не знаю — предложите разные варианты", answers.intensity === "any", () => update("intensity", "any"))}
          </>}
          {step === 8 && <>
            {optionButton("В тёплую погоду", answers.season === "warm", () => update("season", "warm"))}
            {optionButton("В прохладную погоду", answers.season === "cool", () => update("season", "cool"))}
            {optionButton("Круглый год / не имеет значения", answers.season === "any", () => update("season", "any"))}
          </>}
          {step === 9 && <>
            <p className="mb-4 text-sm leading-relaxed text-ivory-muted">В ответах прозвучали {tieFocus.direction} и {tieFocus.occasion}. Что важнее для подбора?</p>
            {optionButton("Ароматическое направление", answers.tieBreak === "direction", () => update("tieBreak", "direction"))}
            {optionButton("Сценарий использования", answers.tieBreak === "occasion", () => update("tieBreak", "occasion"))}
            {optionButton("Оба одинаково важны", answers.tieBreak === "equal", () => update("tieBreak", "equal"))}
          </>}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-ink-600/70 pt-5">
          <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-ivory-muted transition-colors hover:text-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 disabled:invisible">
            <ChevronIcon direction="left" /> Назад
          </button>
          <button type="button" onClick={next} disabled={!canContinue} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gold-gradient px-6 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8">
            {step === 9 ? "Показать подбор" : "Далее"} <ChevronIcon />
          </button>
        </div>
      </section>
      <p className="mt-4 text-center text-xs leading-relaxed text-ivory-faint">Подбор основан на ответах и описаниях ароматов в каталоге.</p>
    </div>
  );
}
