import { PrismaClient } from "@prisma/client";
import { pickSimilar } from "../src/similar-rules.ts";

/**
 * Заполнить блок «Похожие ароматы».
 *
 * Подбор идёт по пирамиде нот, полу и ценовой лиге — правила и их обоснование
 * в `src/similar-rules.ts`, там же тесты.
 *
 * По умолчанию скрипт трогает только те товары, у которых похожие ещё не
 * заданы: подборку правят руками в CRM, и перезатирать её при каждом новом
 * поступлении нельзя. Полный пересчёт — по явному `--rewrite`.
 */
const REWRITE = process.argv.includes("--rewrite");
const LIMIT = 4;

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      slug: true,
      name: true,
      brandId: true,
      gender: true,
      notesTop: true,
      notesMid: true,
      notesBase: true,
      brand: { select: { name: true } },
      volumes: { where: { volumeMl: 3 }, select: { priceByn: true } },
      // `similarTo` — связи, исходящие от товара: те, кого мы показываем рядом.
      similarTo: { select: { similarId: true } },
    },
  });

  const pool = products.map((p) => ({
    id: p.id,
    brandId: p.brandId,
    gender: p.gender,
    notesTop: p.notesTop,
    notesMid: p.notesMid,
    notesBase: p.notesBase,
    priceByn: p.volumes[0] ? Number(p.volumes[0].priceByn) : null,
  }));
  const byId = new Map(products.map((p) => [p.id, p]));

  console.log(
    REWRITE
      ? `♻️  Пересчёт похожих для всех ${products.length} товаров — ручные подборки будут потеряны`
      : `🔗 Подбор похожих: ${products.length} товаров, заполняем только пустые`,
  );

  let filled = 0;
  let skipped = 0;
  const empty = [];

  for (const p of products) {
    if (p.similarTo.length > 0 && !REWRITE) {
      skipped++;
      continue;
    }

    const me = pool.find((x) => x.id === p.id);
    const picked = pickSimilar(me, pool, LIMIT);

    if (picked.length === 0) {
      // Не выдумываем соседей: пустой блок честнее случайного.
      empty.push(`${p.brand.name} ${p.name}`);
      continue;
    }

    await prisma.productSimilar.deleteMany({ where: { productId: p.id } });
    await prisma.productSimilar.createMany({
      data: picked.map((s) => ({ productId: p.id, similarId: s.id })),
    });
    filled++;

    if (process.argv.includes("--verbose")) {
      const names = picked
        .map((s) => `${byId.get(s.id).brand.name} ${byId.get(s.id).name} (${s.score.toFixed(2)})`)
        .join(", ");
      console.log(`   ${p.brand.name} ${p.name} → ${names}`);
    }
  }

  if (empty.length > 0) {
    console.log(`\n⚠️  Не нашлось близких (${empty.length}) — блок останется пустым:`);
    for (const n of empty) console.log(`   ${n}`);
  }

  console.log(
    `\n✅ Готово. Заполнено: ${filled}` +
      (skipped > 0 ? `, оставлено как было: ${skipped}` : ""),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
