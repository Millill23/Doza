import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

// Простейший хеш для dev-сида (в проде используется bcrypt в CRM).
function devHash(pw) {
  return "dev$" + createHash("sha256").update(pw).digest("hex");
}

const IMG = {
  amber: "https://images.unsplash.com/photo-1594035910387-fea47794261f?q=80&w=900&auto=format&fit=crop",
  rose: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?q=80&w=900&auto=format&fit=crop",
  midnight: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=900&auto=format&fit=crop",
  classic: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?q=80&w=900&auto=format&fit=crop",
  green: "https://images.unsplash.com/photo-1610461888750-10bfc601b874?q=80&w=900&auto=format&fit=crop",
  gold: "https://images.unsplash.com/photo-1615634260167-c8cdede054de?q=80&w=900&auto=format&fit=crop",
};

function volumes(base) {
  return [
    { volumeMl: 2, priceByn: Math.round(base * 0.18 * 100) / 100 },
    { volumeMl: 5, priceByn: Math.round(base * 0.4 * 100) / 100 },
    { volumeMl: 10, priceByn: Math.round(base * 0.7 * 100) / 100 },
    { volumeMl: 30, priceByn: Math.round(base * 1.8 * 100) / 100 },
  ];
}

const DATA = [
  { slug: "tom-ford-oud-wood", brand: "Tom Ford", name: "Oud Wood", gender: "unisex", image: IMG.amber, base: 95,
    notesTop: "Розовый перец, кардамон", notesMid: "Уд, сандал, ветивер", notesBase: "Амбра, ваниль, тонка",
    description: "Тёплый древесно-восточный аромат с дымным удом и кремовым сандалом. Глубокий, обволакивающий, благородный." },
  { slug: "chanel-coco-mademoiselle", brand: "Chanel", name: "Coco Mademoiselle", gender: "female", image: IMG.rose, base: 78,
    notesTop: "Апельсин, бергамот", notesMid: "Роза, жасмин", notesBase: "Пачули, ваниль, мускус",
    description: "Изысканный шипрово-цветочный аромат: свежий цитрусовый старт переходит в чувственный пачулевый шлейф." },
  { slug: "dior-sauvage", brand: "Dior", name: "Sauvage", gender: "male", image: IMG.midnight, base: 72,
    notesTop: "Бергамот, перец", notesMid: "Лаванда, амброксан", notesBase: "Кедр, лабданум",
    description: "Свежий и брутальный фужерный аромат. Искрящийся бергамот и мощный амброксан создают магнетический след." },
  { slug: "creed-aventus", brand: "Creed", name: "Aventus", gender: "male", image: IMG.gold, base: 140,
    notesTop: "Ананас, чёрная смородина", notesMid: "Берёза, пачули", notesBase: "Дубовый мох, амбра, мускус",
    description: "Легендарный фруктово-шипровый аромат успеха. Сочный ананас и дымная берёза — символ силы и уверенности." },
  { slug: "ysl-libre", brand: "Yves Saint Laurent", name: "Libre", gender: "female", image: IMG.classic, base: 88,
    notesTop: "Мандарин, лаванда", notesMid: "Жасмин, флёрдоранж", notesBase: "Ваниль, мускус, амбра",
    description: "Дерзкий цветочный аромат свободы: лавандовая прохлада во встрече с тёплым жасмином и ванилью." },
  { slug: "byredo-gypsy-water", brand: "Byredo", name: "Gypsy Water", gender: "unisex", image: IMG.green, base: 110,
    notesTop: "Бергамот, можжевельник, лимон", notesMid: "Ладан, сосна", notesBase: "Амбра, сандал, ваниль",
    description: "Нишевый древесно-ароматический аромат странствий. Хвойная свежесть и дымный ладан на тёплой амбровой базе." },
  { slug: "maison-margiela-jazz-club", brand: "Maison Margiela", name: "Replica Jazz Club", gender: "male", image: IMG.amber, base: 98,
    notesTop: "Розовый перец, лимон, нероли", notesMid: "Ром, табачный лист, шалфей", notesBase: "Ваниль, бобы тонка, стиракс",
    description: "Атмосфера джазового бара: терпкий ром, сладкий табак и ванильный уют. Тёплый и обволакивающий." },
  { slug: "lancome-la-vie-est-belle", brand: "Lancôme", name: "La Vie Est Belle", gender: "female", image: IMG.rose, base: 75,
    notesTop: "Чёрная смородина, груша", notesMid: "Ирис, жасмин, флёрдоранж", notesBase: "Пралине, ваниль, пачули",
    description: "Сладкий гурманский аромат счастья: благородный ирис и кремовое пралине дарят ощущение лёгкости." },
  { slug: "tom-ford-tobacco-vanille", brand: "Tom Ford", name: "Tobacco Vanille", gender: "unisex", image: IMG.gold, base: 135,
    notesTop: "Табачный лист, специи", notesMid: "Ваниль, какао, сухофрукты", notesBase: "Древесные ноты, бобы тонка",
    description: "Роскошный пряно-сладкий аромат: насыщенный табак, тёплая ваниль и медовые сухофрукты. Зимний фаворит." },
  { slug: "guerlain-mon-guerlain", brand: "Guerlain", name: "Mon Guerlain", gender: "female", image: IMG.classic, base: 82,
    notesTop: "Бергамот, лаванда", notesMid: "Жасмин самбак", notesBase: "Ваниль, сандал, бобы тонка",
    description: "Чувственный аромат современной женственности: лавандовая свежесть и тягучая ваниль из Папуа." },
  { slug: "armani-acqua-di-gio", brand: "Giorgio Armani", name: "Acqua di Giò", gender: "male", image: IMG.midnight, base: 70,
    notesTop: "Морская нота, бергамот, мандарин", notesMid: "Розмарин, жасмин, персик", notesBase: "Белый мускус, кедр, пачули",
    description: "Культовый акватический аромат: морская свежесть и средиземноморское солнце. Лёгкий и универсальный." },
  { slug: "le-labo-santal-33", brand: "Le Labo", name: "Santal 33", gender: "unisex", image: IMG.green, base: 125,
    notesTop: "Кардамон, ирис, фиалка", notesMid: "Сандал, амбра, пряности", notesBase: "Кедр, кожа, мускус",
    description: "Икона нишевой парфюмерии: дымный сандал и кожа с лёгкой пряной горчинкой. Узнаваемый и магнетичный." },
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  console.log("🌱 Seeding…");

  // Настройки лояльности
  await prisma.setting.upsert({ where: { key: "loyalty_percent" }, update: {}, create: { key: "loyalty_percent", value: "5" } });
  await prisma.setting.upsert({ where: { key: "loyalty_days" }, update: {}, create: { key: "loyalty_days", value: "180" } });
  await prisma.setting.upsert({ where: { key: "low_stock_threshold" }, update: {}, create: { key: "low_stock_threshold", value: "50" } });

  // Admin
  await prisma.crmUser.upsert({
    where: { email: "admin@doza-parfum.by" },
    update: {},
    create: { email: "admin@doza-parfum.by", passwordHash: devHash("admin123"), name: "Администратор", role: "admin" },
  });

  // Бренды
  const brandNames = [...new Set(DATA.map((d) => d.brand))];
  const brandMap = {};
  for (const name of brandNames) {
    const b = await prisma.brand.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
    brandMap[name] = b.id;
  }

  // Товары
  for (const d of DATA) {
    const product = await prisma.product.upsert({
      where: { slug: d.slug },
      update: {},
      create: {
        slug: d.slug,
        brandId: brandMap[d.brand],
        name: d.name,
        gender: d.gender,
        notesTop: d.notesTop,
        notesMid: d.notesMid,
        notesBase: d.notesBase,
        description: d.description,
        lowStockThreshold: 50,
        photos: { create: [{ url: d.image, sortOrder: 0 }] },
        volumes: { create: volumes(d.base).map((v) => ({ ...v, isActive: true })) },
        inventory: { create: { quantityMl: 500 } },
      },
    });
    console.log(`  ✓ ${d.brand} — ${d.name} (#${product.id})`);
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
