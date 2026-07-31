import { PrismaClient } from "@prisma/client";
import { PRICES } from "./catalog-prices.mjs";
const prisma = new PrismaClient();

// Безопасное обновление ТОЛЬКО объёмов/цен каталога (3 / 5 / 10 мл по прайсу).
// НЕ трогает фото, ноты, описания, товары и остатки — можно запускать на проде.
// Идемпотентно: перезаписывает объёмы существующих товаров по slug.
async function main() {
  const slugs = Object.keys(PRICES);
  let updated = 0;
  const missing = [];
  for (const slug of slugs) {
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) {
      missing.push(slug);
      continue;
    }
    const [p3, p5, p10] = PRICES[slug];
    await prisma.productVolume.deleteMany({ where: { productId: product.id } });
    await prisma.productVolume.createMany({
      data: [
        { productId: product.id, volumeMl: 3, priceByn: p3, isActive: true },
        { productId: product.id, volumeMl: 5, priceByn: p5, isActive: true },
        { productId: product.id, volumeMl: 10, priceByn: p10, isActive: true },
      ],
    });
    updated++;
  }
  console.log(`✅ Обновлено объёмов/цен: ${updated} из ${slugs.length}`);
  if (missing.length)
    console.warn(`⚠️ Нет товара для slug (пропущены ${missing.length}): ${missing.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
