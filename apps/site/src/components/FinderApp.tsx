import { useMemo, useState } from "react";
import type { FinderProduct, Gender } from "../lib/types";
import { GENDER_LABELS } from "../lib/types";

interface Props {
  products: FinderProduct[];
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

// Семьи ароматов → ключевые слова в нотах (в нижнем регистре)
const FAMILIES: { id: string; label: string; emoji: string; keywords: string[] }[] = [
  { id: "fresh", label: "Свежие", emoji: "🌊", keywords: ["цитрус", "бергамот", "лимон", "морск", "водн", "мят", "зелён", "зелен", "нероли", "грейпфрут", "лайм", "мандарин", "апельсин", "розмарин"] },
  { id: "woody", label: "Древесные", emoji: "🌳", keywords: ["сандал", "кедр", "уд", "ветивер", "дерев", "пачули", "мох", "сосн", "можжевел"] },
  { id: "sweet", label: "Сладкие", emoji: "🍯", keywords: ["ваниль", "карамель", "пралине", "шоколад", "какао", "тонка", "мёд", "мед", "сахар", "гурман", "груша", "ирис"] },
  { id: "floral", label: "Цветочные", emoji: "🌸", keywords: ["роза", "жасмин", "цветок", "цвет", "пион", "фиалк", "флёрдоранж", "флердоранж", "ландыш", "лаванд"] },
  { id: "spicy", label: "Пряные / восточные", emoji: "🔥", keywords: ["амбр", "специ", "перец", "кардамон", "корица", "ладан", "табак", "кожа", "восточн", "прян", "ром", "шалфей"] },
];

const GENDERS: { value: Gender | ""; label: string }[] = [
  { value: "", label: "Не важно" },
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
  { value: "unisex", label: "Унисекс" },
];

export default function FinderApp({ products }: Props) {
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<Gender | "">("");
  const [families, setFamilies] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  function toggleFamily(id: string) {
    setFamilies((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  }

  const results = useMemo(() => {
    if (!done) return [];
    const chosen = FAMILIES.filter((f) => families.includes(f.id));
    let list = products;
    if (gender) list = list.filter((p) => p.gender === gender);

    const scored = list
      .map((p) => {
        let score = 0;
        for (const fam of chosen) {
          for (const kw of fam.keywords) {
            if (p.notes.includes(kw)) score += 1;
          }
        }
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);

    // если выбраны семьи — берём с положительным скором; иначе просто по гендеру
    const positive = scored.filter((s) => s.score > 0);
    const final = (chosen.length ? positive : scored).slice(0, 6);
    return final.map((s) => s.p);
  }, [done, families, gender, products]);

  function restart() {
    setStep(0);
    setGender("");
    setFamilies([]);
    setDone(false);
  }

  // ── Результаты ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-ivory-muted">
            Подобрали {results.length}{" "}
            {results.length === 1 ? "аромат" : "ароматов"} под ваш вкус
          </p>
          <button
            onClick={restart}
            className="text-sm text-ivory-faint underline-offset-4 transition-colors hover:text-gold-400 hover:underline"
          >
            Пройти заново
          </button>
        </div>

        {results.length === 0 ? (
          <div className="rounded-xl border border-ink-600/60 bg-ink-700 p-10 text-center text-ivory-muted">
            Не нашли точного совпадения.{" "}
            <a href="/catalog" className="text-gold-400 hover:text-gold-300">
              Посмотрите весь каталог
            </a>
            .
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
            {results.map((p) => (
              <a
                key={p.id}
                href={`/product/${p.slug}`}
                className="group relative block overflow-hidden rounded-xl border border-ink-600/60 bg-ink-700 transition-all duration-300 hover:border-gold-500/70 hover:shadow-gold"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-ink-900">
                  <img
                    src={p.image}
                    alt={`${p.brand} ${p.name}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full border border-gold-500/30 bg-ink-900/70 px-2.5 py-1 text-[11px] font-light text-gold-400 backdrop-blur-sm">
                    {GENDER_LABELS[p.gender]}
                  </span>
                </div>
                <div className="space-y-2 p-4 sm:p-5">
                  <div className="text-[11px] font-medium uppercase tracking-luxe text-gold-500">
                    {p.brand}
                  </div>
                  <h3 className="font-serif text-lg leading-tight text-ivory sm:text-xl">
                    {p.name}
                  </h3>
                  <span className="text-base font-medium text-gold-400">
                    от {byn(p.priceFrom)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href="/catalog"
            className="inline-flex h-11 items-center rounded-full border border-gold-500/70 px-6 text-sm text-gold-400 transition-colors hover:bg-gold-500/10"
          >
            Смотреть весь каталог
          </a>
        </div>
      </div>
    );
  }

  // ── Шаги квиза ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      {/* прогресс */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-16 rounded-full transition-colors ${
              i <= step ? "bg-gold-gradient" : "bg-ink-600"
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="text-center">
          <h2 className="mb-6 font-serif text-2xl text-ivory sm:text-3xl">
            Для кого подбираем аромат?
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {GENDERS.map((g) => (
              <button
                key={g.value || "any"}
                onClick={() => {
                  setGender(g.value);
                  setStep(1);
                }}
                className="rounded-full border border-ink-600 px-6 py-3 text-base text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-300"
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="text-center">
          <h2 className="mb-2 font-serif text-2xl text-ivory sm:text-3xl">
            Какие ароматы вам ближе?
          </h2>
          <p className="mb-6 text-sm text-ivory-faint">
            Можно выбрать несколько
          </p>
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FAMILIES.map((f) => {
              const active = families.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFamily(f.id)}
                  className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-left transition-colors ${
                    active
                      ? "border-gold-500 bg-gold-500/10 text-gold-200"
                      : "border-ink-600 text-ivory-muted hover:border-gold-600/60"
                  }`}
                >
                  <span className="text-2xl">{f.emoji}</span>
                  <span className="text-base">{f.label}</span>
                  {active && <span className="ml-auto text-gold-400">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setStep(0)}
              className="rounded-full border border-ink-600 px-6 py-3 text-sm text-ivory-muted transition-colors hover:border-gold-600/60"
            >
              Назад
            </button>
            <button
              onClick={() => setDone(true)}
              className="rounded-full bg-gold-gradient px-8 py-3 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
            >
              Показать ароматы
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
