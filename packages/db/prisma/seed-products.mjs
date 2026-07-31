import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Актуальный прайс из doza_prices.xlsx: цена BYN за 3 / 5 / 10 мл.
// Других объёмов нет. Ключ — slug(бренд + название).
const PRICES = {
  "27-87-perfumes-elixir-de-bombe": [45, 68, 108],
  "27-87-perfumes-hakuna-matata": [32, 48, 74],
  "armand-basi-in-red": [12, 18, 33],
  "burberry-weekend": [15, 23, 41],
  "bvlgari-omnia-crystalline": [22, 32, 55],
  "bybozo-habibi": [29, 48, 87],
  "byredo-bal-dafrique": [32, 44, 75],
  "byredo-gypsy-water": [32, 44, 75],
  "byredo-rose-noir": [32, 44, 75],
  "calvin-klein-ck-one": [12, 18, 33],
  "calvin-klein-ck-one-shock": [12, 18, 33],
  "calvin-klein-euphoria": [25, 40, 72],
  "calvin-klein-in2u": [12, 18, 32],
  "chanel-5": [35, 55, 98],
  "chanel-coco-mademoiselle": [45, 70, 120],
  "chloe-chloe": [22, 32, 55],
  "chloe-love-story": [22, 32, 55],
  "dolce-gabbana-k": [25, 40, 72],
  "dolce-gabbana-limperatrice-3": [18, 26, 42],
  "dolce-gabbana-q-intense": [18, 26, 42],
  "dolce-gabbana-the-one": [25, 40, 72],
  "escentric-molecules-escentric-02": [32, 44, 75],
  "escentric-molecules-molecule-01-iris": [32, 44, 75],
  "essential-parfums-bois-imperial": [23, 40, 72],
  "essential-parfums-orange-x-santal": [23, 40, 72],
  "essential-parfums-the-musc": [22, 32, 55],
  "ex-nihilo-blue-talisman": [45, 70, 125],
  "ex-nihilo-fleur-narcotique": [45, 70, 125],
  "floraiku-one-umbrella-for-two": [40, 60, 110],
  "franck-boclet-cocaine": [27, 39, 71],
  "franck-boclet-tobacco": [27, 39, 71],
  "franck-boclet-vanille": [27, 39, 71],
  "giorgio-armani-acqua-di-gio": [18, 26, 42],
  "giorgio-armani-si": [35, 50, 80],
  "giorgio-armani-si-passione": [55, 85, 150],
  "givenchy-ange-ou-demon": [22, 32, 55],
  "gucci-flora-gorgeous-gardenia": [26, 38, 65],
  "gucci-flora-gorgeous-magnolia": [26, 38, 65],
  "hormone-gaba": [39, 59, 98],
  "initio-magnetic-blend-7": [39, 59, 98],
  "initio-musk-therapy": [45, 70, 125],
  "initio-narcotic-delight": [39, 59, 98],
  "initio-psychedelic-love": [39, 59, 98],
  "jo-malone-wood-sage-sea-salt": [28, 39, 71],
  "kilian-angels-share": [67, 104, 175],
  "kilian-black-phantom": [89, 128, 225],
  "kilian-good-girl-gone-bad": [72, 120, 192],
  "les-soeurs-de-noe-citrus-poetry": [32, 44, 75],
  "louis-vuitton-imagination": [75, 119, 205],
  "louis-vuitton-pacific-chill": [75, 119, 205],
  "maison-francis-kurkdjian-baccarat-rouge-540": [45, 70, 125],
  "maison-francis-kurkdjian-grand-soir": [59, 93, 155],
  "maison-francis-kurkdjian-oud": [59, 93, 155],
  "marc-antoine-barrois-ganymede": [43, 72, 122],
  "marc-antoine-barrois-tilia": [43, 72, 122],
  "max-philip-mandarin": [26, 42, 68],
  "montale-chocolate-greedy": [22, 32, 55],
  "montale-oudmazing": [22, 32, 55],
  "montale-vanilla-cake": [22, 32, 55],
  "narciso-rodriguez-for-her-musc-nude": [18, 25, 39],
  "orlov-paris-de-young-red": [25, 39, 68],
  "paco-rabanne-1-million": [25, 40, 72],
  "paco-rabanne-lady-million": [45, 70, 120],
  "thomas-kosmala-4-apres-lamour": [22, 32, 55],
  "tiziana-terenzi-andromeda": [32, 44, 75],
  "tiziana-terenzi-kirke": [23, 38, 69],
  "tom-ford-black-orchid": [45, 65, 105],
  "tom-ford-ombre-leather": [36, 60, 108],
  "tom-ford-oud-wood": [60, 85, 150],
  "tom-ford-vanilla-sex": [60, 85, 150],
  "trussardi-aperitivo-milanese-porta-nuova": [25, 40, 72],
  "trussardi-donna": [13, 21, 38],
  "trussardi-my-name": [25, 40, 72],
  "trussardi-ruby-red": [29, 45, 80],
  "versace-bright-crystal": [18, 26, 42],
  "versace-eros": [25, 40, 72],
  "versace-eros-energy": [25, 40, 72],
  "vilhelm-parfumerie-chimilka": [60, 85, 150],
  "vilhelm-parfumerie-mango-skin": [35, 55, 98],
  "vilhelm-parfumerie-morning-chess": [45, 65, 105],
  "vilhelm-parfumerie-room-service": [35, 55, 98],
  "xerjoff-erba-pura": [32, 48, 86],
  "yves-saint-laurent-black-opium": [32, 48, 86],
  "zarkoperfume-pink-molecule-09009": [18, 30, 54],
  "zarkoperfume-sending-love": [18, 30, 54],
  "zarkoperfume-the-muse": [18, 30, 54],
};

// Только 3 / 5 / 10 мл — по прайсу. Нет цены → падаем громко.
function volumes(slug) {
  const p = PRICES[slug];
  if (!p) throw new Error(`Нет цены для slug "${slug}" — сверь PRICES с прайсом`);
  return [
    { volumeMl: 3, priceByn: p[0], isActive: true },
    { volumeMl: 5, priceByn: p[1], isActive: true },
    { volumeMl: 10, priceByn: p[2], isActive: true },
  ];
}
function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // é→e, ì→i, ó→o и т.п.
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[`'’.]/g, "")
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

// Тематические плейсхолдеры (пока нет реального фото флакона)
const IMG = {
  fresh: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=900&auto=format&fit=crop",
  floral: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?q=80&w=900&auto=format&fit=crop",
  sweet: "https://images.unsplash.com/photo-1615634260167-c8cdede054de?q=80&w=900&auto=format&fit=crop",
  woody: "https://images.unsplash.com/photo-1610461888750-10bfc601b874?q=80&w=900&auto=format&fit=crop",
  oriental: "https://images.unsplash.com/photo-1594035910387-fea47794261f?q=80&w=900&auto=format&fit=crop",
  classic: "https://images.unsplash.com/photo-1587017539504-67cfbddac569?q=80&w=900&auto=format&fit=crop",
};

// Слаги, для которых уже готово реальное фото флакона (в apps/site/public/img/products/<slug>.webp).
// Пополняется батчами — по мере обработки фото.
const LOCAL = new Set([
  // batch 1: designer
  "versace-eros",
  "chanel-coco-mademoiselle",
  "paco-rabanne-lady-million",
  "paco-rabanne-1-million",
  "yves-saint-laurent-black-opium",
  // batch 2: designer
  "dolce-gabbana-k",
  "dolce-gabbana-the-one",
  "versace-bright-crystal",
  "bvlgari-omnia-crystalline",
  "giorgio-armani-si",
  "givenchy-ange-ou-demon",
  "gucci-flora-gorgeous-gardenia",
  // batch 3: designer
  "versace-eros-energy",
  "burberry-weekend",
  "trussardi-my-name",
  "narciso-rodriguez-for-her-musc-nude",
  "calvin-klein-ck-one-shock",
  "trussardi-ruby-red",
  "armand-basi-in-red",
  "calvin-klein-in2u",
  "chloe-chloe",
  "gucci-flora-gorgeous-magnolia",
]);

// [brand, name, gender, bottleMl, usd, family, notesTop, notesMid, notesBase, description]
const DATA = [
  ["Armand Basi","In Red","female",100,40,"floral","Красное яблоко, цветочные ноты","Гардения, жасмин, роза","Мускус, амбра, сандал","Яркий фруктово-цветочный аромат: сочное красное яблоко и вуаль белых цветов."],
  ["Giorgio Armani","Sì","female",100,90,"floral","Чёрная смородина, бергамот","Роза, фрезия","Ваниль, пачули, древесные ноты","Шипрово-фруктовый аромат: нектар чёрной смородины, роза и ванильно-древесный шлейф."],
  ["Giorgio Armani","Sì Passione","female",100,95,"floral","Груша, чёрная смородина, бергамот","Роза, жасмин, гелиотроп","Ваниль, пачули, кедр","Страстная версия Sì: сочные фрукты, роза и тёплый ванильный шлейф."],
  ["Giorgio Armani","Acqua di Giò","male",100,50.93,"fresh","Морская нота, бергамот, мандарин","Розмарин, жасмин, персик","Белый мускус, кедр, пачули","Культовый акватический аромат: морская свежесть и средиземноморское солнце."],
  ["Burberry","Weekend","female",100,30,"floral","Дикая роза, резеда, мандарин","Иланг-иланг, гиацинт, персик","Кедр, сандал, мускус, дуб","Свежий цветочный аромат выходного дня — дикая роза и солнечные фрукты."],
  ["Calvin Klein","IN2U","unisex",100,25,"fresh","Красная смородина, чёрный перец","Нероли, тубероза","Амбра, ирис, красное дерево","Дерзкий свежий унисекс-аромат с искрой перца и цитруса."],
  ["Calvin Klein","Euphoria","female",100,40,"oriental","Гранат, хурма, зелёные ноты","Чёрная орхидея, лотос, шампань","Красное дерево, амбра, кремовый аккорд","Чувственный тёмно-фруктовый аромат с чёрной орхидеей."],
  ["Calvin Klein","CK One","male",100,16.94,"fresh","Бергамот, кардамон, ананас, папайя","Жасмин, фиалка, мускатный орех","Мускус, амбра, дубовый мох","Легендарный свежий цитрусовый унисекс-аромат 90-х."],
  ["Calvin Klein","CK One Shock","female",100,13.75,"floral","Ежевика, лист фиалки","Пион, роза, кактус","Пачули, амбра, ваниль","Дерзкий фруктово-цветочный аромат."],
  ["Dolce & Gabbana","K","male",100,60,"woody","Кровавый апельсин, можжевельник, лимон","Розовый перец, герань, шалфей","Кедр, ветивер, пачули","Брутально-свежий мужской аромат: цитрус, специи и сухое дерево."],
  ["Dolce & Gabbana","The One","male",100,70,"oriental","Грейпфрут, кориандр, базилик","Кардамон, имбирь, апельсиновый цвет","Табак, амбра, кедр","Тёплый пряно-табачный мужской аромат-икона."],
  ["Dolce & Gabbana","L'Imperatrice №3","female",100,45,"fresh","Киви, арбуз","Цикламен, жасмин","Мускус, амбра","Свежий фруктово-цветочный аромат — арбуз и лёгкий мускус."],
  ["Dolce & Gabbana","Q Intense","female",100,51.92,"fresh","Сицилийский лимон, бергамот, вишня","Жасмин самбак","Пачули, кедр, ветивер, мускус","Яркий цитрусово-цветочный аромат с сицилийским лимоном."],
  ["Givenchy","Ange ou Démon","female",100,60,"oriental","Шафран, тимьян, мандарин","Лилия, орхидея, иланг-иланг","Тонка, ваниль, дуб","Мистический пряно-цветочный аромат с ванильно-древесной глубиной."],
  ["Paco Rabanne","1 Million","male",100,55,"oriental","Грейпфрут, мята, кровавый мандарин","Роза, корица, специи","Кожа, амбра, древесные ноты","Дерзкий пряно-кожаный мужской бестселлер с искрой цитруса."],
  ["Paco Rabanne","Lady Million","female",100,55,"floral","Малина, нероли, лимон","Жасмин, апельсиновый цвет","Мёд, пачули, амбра","Гламурный фруктово-цветочный аромат с медовым шлейфом."],
  ["Trussardi","Donna","female",100,45,"floral","Чёрная смородина, бергамот","Пион, жасмин, роза","Сандал, бензоин, ваниль","Женственный цветочный аромат с мягким сандалово-ванильным шлейфом."],
  ["Trussardi","My Name","female",100,45,"floral","Розовый перец","Ирис, апельсиновый цвет","Сандал, мускус","Пудрово-цветочный аромат с ирисом — нежный и элегантный."],
  ["Trussardi","Ruby Red","female",100,45,"floral","Кровавый апельсин, малина","Роза, магнолия","Пачули, мускус","Сочный фруктово-цветочный аромат с рубиновым характером."],
  ["Versace","Eros","male",100,45,"woody","Мята, зелёное яблоко, лимон","Тонка, амброксан, герань","Ваниль, кедр, ветивер, дубовый мох","Культовый свежо-древесный мужской аромат с ванильно-мятным шлейфом."],
  ["Versace","Eros Energy","male",100,50,"fresh","Лимон, бергамот, мята","Морской аккорд, розовый перец","Древесные ноты, мускус","Заряжающая свежая версия Eros — цитрус, морской бриз и дерево."],
  ["Versace","Bright Crystal","female",90,35.97,"floral","Гранат, юзу, ледяной аккорд","Пион, магнолия, лотос","Мускус, красное дерево, амбра","Свежий цветочно-фруктовый аромат с гранатом и пионом."],
  ["27 87 Perfumes","Elixir de Bombe","unisex",87,71.50,"oriental","Шафран, специи","Роза, уд","Ваниль, амбра, бобы тонка","Нишевый пряно-сладкий аромат с шафраном и ванилью."],
  ["27 87 Perfumes","Hakuna Matata","unisex",87,66.22,"oriental","Цитрус, специи","Табак, пряности","Кожа, ваниль, амбра","Тёплый пряно-табачный нишевый аромат."],
  ["Bvlgari","Omnia Crystalline","female",100,87.78,"fresh","Бамбук, нашия","Лотос","Бальзовое дерево, мускус","Прозрачный водно-цветочный аромат с бамбуком и лотосом."],
  ["Bybozo","Habibi","unisex",75,100.43,"oriental","Специи, цитрус","Роза, уд","Амбра, ваниль","Нишевый пряно-восточный аромат."],
  ["Byredo","Bal d'Afrique","unisex",100,139.92,"woody","Бергамот, нероли, бархатцы, лимон","Фиалка, жасмин, цикламен","Кедр, мускус, ветивер, амбра","Тёплый цветочно-древесный аромат в духе Парижа 20-х."],
  ["Byredo","Gypsy Water","unisex",100,139.92,"woody","Бергамот, можжевельник, лимон, перец","Ладан, сосна","Амбра, сандал, ваниль","Древесно-ароматический аромат странствий с хвоей и ванилью."],
  ["Byredo","Rose Noir","unisex",100,139.92,"floral","Роза, бергамот","Фрезия, роза","Мускус, амбра, дубовый мох","Тёмная роза с мускусной глубиной."],
  ["Chanel","Coco Mademoiselle","female",100,181.61,"floral","Апельсин, бергамот, мандарин","Роза, жасмин, личи","Пачули, ваниль, бобы тонка, мускус","Изысканный шипрово-цветочный аромат: свежий старт и чувственный пачулевый шлейф."],
  ["Chanel","№5","female",100,137.06,"classic","Альдегиды, нероли, иланг-иланг, бергамот","Роза, жасмин, ландыш","Сандал, ваниль, ветивер, мускус","Легендарный альдегидно-цветочный аромат — символ элегантности."],
  ["Chloé","Chloé","female",75,62.70,"floral","Пион, личи, фрезия","Роза, магнолия, ландыш","Кедр, амбра","Романтичный розовый аромат с пудровым шлейфом."],
  ["Chloé","Love Story","female",75,51.37,"floral","Нероли, бергамот","Флёрдоранж, жасмин","Кедр, мускус","Нежный цветочный аромат — флёрдоранж и жасмин."],
  ["Escentric Molecules","Escentric 02","unisex",100,135.96,"woody","Лайм, розовый перец","Османтус, фрезия","Iso E Super, мускус, бальзам","Минималистичный древесно-мускусный аромат вокруг молекулы Iso E Super."],
  ["Escentric Molecules","Molecule 01 + Iris","unisex",100,130.13,"woody","Ирис","Iso E Super","Пудровые древесные ноты","Iso E Super в дуэте с пудровым ирисом."],
  ["Essential Parfums","Bois Imperial","unisex",100,98.12,"woody","Грейпфрут, бергамот","Ветивер, пачули, герань","Амброксан, кедр, мускус","Свежий древесный аромат — ветивер и амброксан."],
  ["Essential Parfums","Orange X Santal","unisex",100,61.49,"woody","Апельсин, петитгрейн","Сандал","Кедр, мускус","Солнечный цитрусово-сандаловый аромат."],
  ["Essential Parfums","The Musc","unisex",100,70.95,"floral","Бергамот, роза","Белые цветы","Мускус, амбретта","Чистый мускусный аромат с цветочной вуалью."],
  ["Ex Nihilo","Blue Talisman","unisex",100,258.94,"fresh","Личи, мята, бергамот","Имбирь","Мускус, кедр","Свежий фруктово-пряный нишевый аромат."],
  ["Ex Nihilo","Fleur Narcotique","unisex",100,264.88,"floral","Бергамот, персик, личи","Пион, апельсиновый цвет, жасмин","Мускус, дубовый мох","Культовый цветочно-фруктовый нишевый бестселлер."],
  ["Floraiku","One Umbrella for Two","unisex",50,108.13,"woody","Чай, специи","Цветочные ноты","Древесные ноты, мускус","Утончённый чайно-цветочный японский нишевый аромат."],
  ["Franck Boclet","Cocaine","unisex",100,67.43,"sweet","Ирис, мята","Специи","Ваниль, амбра, мускус","Провокационный пряно-ванильный нишевый аромат."],
  ["Franck Boclet","Tobacco","male",100,54.89,"oriental","Специи","Табак, корица","Ваниль, бобы тонка, кожа","Тёплый табачно-пряный мужской аромат."],
  ["Franck Boclet","Vanille","unisex",100,52.91,"sweet","Специи","Ваниль","Бобы тонка, мускус, сандал","Гурманская ваниль с пряной глубиной."],
  ["Gucci","Flora Gorgeous Gardenia","female",100,76.78,"floral","Груша, красные ягоды","Гардения, жасмин","Коричневый сахар, пачули","Сладкий цветочный аромат с гарденией и жасмином."],
  ["Gucci","Flora Gorgeous Magnolia","female",100,70.40,"floral","Чёрная смородина, нероли","Магнолия","Ваниль, мускус","Свежий цветочный аромат с магнолией."],
  ["Hormone","GABA","unisex",100,195.69,"woody","Цитрус","Цветы, специи","Мускус, амбра, древесные ноты","Современный нишевый древесно-мускусный аромат."],
  ["Initio","Magnetic Blend 7","unisex",90,110.00,"oriental","Специи","Жасмин, кашмеран","Ваниль, амбра, мускус","Магнетичный цветочно-амбровый афродизиак."],
  ["Initio","Musk Therapy","unisex",90,197.45,"woody","Бергамот","Белый мускус","Амброксан, ветивер","Чистый обволакивающий мускус."],
  ["Initio","Narcotic Delight","unisex",90,165.55,"sweet","Специи","Роза, тубероза","Ваниль, бензоин, амбра","Гипнотический сладко-пряный нишевый аромат."],
  ["Initio","Psychedelic Love","unisex",90,158.51,"floral","Роза, шафран","Пачули","Ваниль, бензоин, мускус","Чувственный розово-пачулевый аромат с ванилью."],
  ["Kilian","Angels' Share","female",100,270.05,"sweet","Коньяк","Корица, бобы тонка, дубовый абсолют","Ваниль, пралине, сандал","Согревающий гурманский аромат — коньяк, ваниль и корица."],
  ["Kilian","Black Phantom","unisex",100,380.82,"sweet","Ром","Кофе","Сахар, миндаль, сандал","«Пиратский» гурманский аромат — ром, кофе и сахар."],
  ["Kilian","Good Girl Gone Bad","female",50,212.85,"floral","Жасмин самбак, тубероза","Османтус, нарцисс","Роза, амбра","Роскошный белоцветочный аромат."],
  ["Jo Malone","Wood Sage & Sea Salt","unisex",100,110.11,"fresh","Морская соль","Шалфей","Амбра, красные водоросли","Свежий морской аромат — солёный бриз и шалфей."],
  ["Les Soeurs De Noé","Citrus Poetry","unisex",100,90,"fresh","Цитрусовые, бергамот","Нероли, цветочные ноты","Мускус, древесные ноты","Свежий цитрусовый нишевый аромат с цветочной поэтикой."],
  ["Louis Vuitton","Imagination","unisex",100,520.19,"fresh","Бергамот, мандарин","Чай","Амброксан, кедр","Искрящийся цитрусово-чайный аромат класса люкс."],
  ["Louis Vuitton","Pacific Chill","unisex",100,496.65,"fresh","Цитрус, мята, чёрная смородина","Зелёные ноты","Мускус, древесные ноты","Освежающий цитрусово-мятный аромат."],
  ["Maison Francis Kurkdjian","Baccarat Rouge 540","unisex",200,460.02,"sweet","Шафран, жасмин","Амбра, древесные ноты","Кедр, амбра","Легендарный шафраново-амбровый аромат с сияющим шлейфом."],
  ["Maison Francis Kurkdjian","Grand Soir","unisex",70,206.91,"oriental","Бензоин","Амбра, ваниль","Тонка, ладан","Тёплый амброво-ванильный вечерний аромат."],
  ["Maison Francis Kurkdjian","Oud","unisex",70,195.14,"woody","Шафран","Уд","Пачули, древесные ноты","Благородный уд с пряной глубиной."],
  ["Marc-Antoine Barrois","Ganymede","unisex",100,187.99,"woody","Мандарин, шафран","Замша, металлический аккорд","Амбра, мускус, ветивер","Замшево-мандариновый нишевый бестселлер с минеральной прохладой."],
  ["Marc-Antoine Barrois","Tilia","unisex",100,195.14,"fresh","Липа, зелёные ноты","Цветы липы","Мускус, древесные ноты","Свежий аромат цветущей липы."],
  ["Max Philip","Mandarin","unisex",100,80,"fresh","Мандарин, цитрусовые","Цветочные ноты","Мускус, древесные ноты","Сочный мандариновый нишевый аромат."],
  ["Montale","Chocolate Greedy","unisex",100,60.17,"sweet","Апельсин","Какао, кофе","Сухофрукты, ваниль","Гурманский шоколадно-ванильный аромат."],
  ["Montale","Oudmazing","female",100,76.23,"oriental","Фрукты","Роза, уд","Амбра, мускус","Фруктовый уд с розой."],
  ["Montale","Vanilla Cake","female",100,63.91,"sweet","Цитрус","Ваниль, карамель","Сахар, мускус","Сладкий десертный аромат — ванильный кекс."],
  ["Narciso Rodriguez","For Her Musc Nude","female",100,90,"floral","Мускус","Роза, жасмин","Амбра, кашемировое дерево","Обнажённый мускус: чистый, тёплый и обволакивающий."],
  ["Orlov Paris","De Young Red","unisex",75,59.18,"oriental","Специи, шафран","Роза, уд","Амбра, ваниль","Насыщенный пряно-восточный нишевый аромат."],
  ["Thomas Kosmala","№ 4 Apres l'Amour","unisex",240,136.95,"floral","Бергамот, шафран","Жасмин, роза","Мускус, амбра, сандал","Чувственный цветочно-мускусный аромат."],
  ["Tiziana Terenzi","Andromeda","unisex",100,128.81,"woody","Бергамот, груша","Цветочные ноты","Уд, амбра, мускус","Сияющий фруктово-древесный нишевый аромат."],
  ["Tiziana Terenzi","Kirke","unisex",100,82.83,"sweet","Маракуйя, груша","Персик, цветочные ноты","Сандал, мускус, ваниль","Сочный фруктовый бестселлер с маракуйей."],
  ["Tom Ford","Black Orchid","female",100,101.20,"oriental","Трюфель, чёрная смородина, иланг-иланг, бергамот","Орхидея, специи","Пачули, ваниль, ладан, сандал","Роскошный тёмный аромат — чёрная орхидея и трюфель."],
  ["Tom Ford","Ombré Leather","unisex",100,187.11,"woody","Кардамон","Кожа, жасмин","Амбра, мускус, пачули","Брутальный кожаный аромат с цветочным сердцем."],
  ["Tom Ford","Oud Wood","unisex",100,276.10,"woody","Розовый перец, кардамон","Уд, сандал, ветивер","Амбра, ваниль, тонка","Тёплый дымный уд с кремовым сандалом."],
  ["Tom Ford","Vanilla Sex","unisex",100,354.75,"sweet","Специи","Ваниль, бобы тонка","Сандал, амбра, мускус","Тёплый ванильно-пряный аромат."],
  ["Trussardi","Aperitivo Milanese Porta Nuova","unisex",100,82.83,"fresh","Цитрус, горькие травы","Аперитивный аккорд","Древесные ноты, мускус","Игристый цитрусово-горький аромат в духе миланского аперитива."],
  ["Vilhelm Parfumerie","Chimilka","unisex",100,260.15,"sweet","Молоко, специи","Миндаль","Ваниль, мускус","Нишевый молочно-сладкий гурманский аромат."],
  ["Vilhelm Parfumerie","Mango Skin","unisex",100,148.94,"sweet","Манго, ананас, чёрная смородина","Пион","Мускус, древесные ноты","Сочный манго с цветочно-мускусным шлейфом."],
  ["Vilhelm Parfumerie","Morning Chess","unisex",100,154.99,"fresh","Бергамот, ревень","Тимьян, герань","Дубовый мох, ветивер","Свежий ароматно-зелёный аромат."],
  ["Vilhelm Parfumerie","Room Service","female",100,143.11,"floral","Шампанское, цитрус","Тубероза, флёрдоранж","Мускус, ваниль","Гламурный игристый цветочный аромат."],
  ["Xerjoff","Erba Pura","unisex",100,117.59,"sweet","Сицилийский апельсин, лимон, фрукты","Белые цветы","Амбра, мускус, ваниль","Роскошный фруктово-амбровый бестселлер."],
  ["Yves Saint Laurent","Black Opium","female",90,100.32,"sweet","Груша, розовый перец, апельсиновый цвет","Кофе, жасмин","Ваниль, пачули, кедр","Соблазнительный кофейно-ванильный аромат."],
  ["Zarkoperfume","Pink Molécule 090.09","unisex",100,72.16,"floral","Свежие ноты","Жасмин, фиалка","Мускус, амбра, кашемировое дерево","Магнетичный чистый аромат с мускусом и жасмином."],
  ["Zarkoperfume","Sending Love","unisex",100,50.16,"floral","Фрукты","Цветочные ноты","Мускус, амбра","Лёгкий цветочно-мускусный аромат."],
  ["Zarkoperfume","The Muse","female",100,72,"floral","Груша, яблоко","Жасмин, тубероза","Мускус, сандал","Фруктово-цветочный мускусный аромат с чувственным характером."],
];

async function main() {
  console.log(`🌱 Наполнение каталога: ${DATA.length} позиций`);

  // Бренды
  const brandNames = [...new Set(DATA.map((d) => d[0]))];
  const brandMap = {};
  for (const name of brandNames) {
    const b = await prisma.brand.upsert({
      where: { name },
      update: { slug: slugify(name) },
      create: { name, slug: slugify(name) },
    });
    brandMap[name] = b.id;
  }

  const keepSlugs = [];
  for (const [brand, name, gender, bottleMl, usd, family, top, mid, base, desc] of DATA) {
    const slug = slugify(`${brand} ${name}`);
    keepSlugs.push(slug);

    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        brandId: brandMap[brand], name, gender, notesTop: top, notesMid: mid,
        notesBase: base, description: desc, isArchived: false, lowStockThreshold: 50,
      },
      create: {
        slug, brandId: brandMap[brand], name, gender, notesTop: top, notesMid: mid,
        notesBase: base, description: desc, isArchived: false, lowStockThreshold: 50,
      },
    });

    // объёмы — пересобрать
    await prisma.productVolume.deleteMany({ where: { productId: product.id } });
    await prisma.productVolume.createMany({
      data: volumes(slug).map((v) => ({ ...v, productId: product.id })),
    });

    // фото: реальное локальное (если готово) либо тематический плейсхолдер
    const url = LOCAL.has(slug) ? `/img/products/${slug}.webp` : (IMG[family] ?? IMG.classic);
    await prisma.productPhoto.deleteMany({ where: { productId: product.id } });
    await prisma.productPhoto.create({
      data: { productId: product.id, url, sortOrder: 0 },
    });

    // остаток (не трогаем существующий, создаём при отсутствии)
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: {},
      create: { productId: product.id, quantityMl: 500 },
    });
  }

  // Архивируем всё, чего нет в списке (старые демо-товары), не ломая заказы
  const archived = await prisma.product.updateMany({
    where: { slug: { notIn: keepSlugs } },
    data: { isArchived: true },
  });

  console.log(`✅ Готово. Активных товаров: ${keepSlugs.length}, архивировано старых: ${archived.count}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
