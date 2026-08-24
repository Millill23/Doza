import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Наполнить справочник отделений Европочты.
 *
 * Источник — `europost-offices.json`, снятый с их страницы отделений. Через
 * сервер их сайт не читается: он отвечает 403 и требует пройти проверку в
 * браузере, поэтому список снимается вручную и лежит в репозитории. Координаты
 * сюда не входят — их доливает фоновая задача из OpenStreetMap.
 *
 * Скрипт идемпотентен: существующие отделения обновляются, новые заводятся.
 * Пропавшие из списка не удаляются, а помечаются закрытыми — на них могут
 * ссылаться уже оформленные заказы.
 */
const here = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

/** Город из адреса: «г. Минск, ул. ...» → «Минск». */
function cityOf(address) {
  return address
    .replace(/^(г\.|аг\.|гп\.|пгт\.|п\.|д\.)\s*/i, "")
    .split(",")[0]
    .trim();
}

async function main() {
  const rows = JSON.parse(
    readFileSync(join(here, "europost-offices.json"), "utf8"),
  );
  console.log(`📮 Отделения Европочты: ${rows.length} в списке`);

  const codes = [];
  let added = 0;
  let updated = 0;

  for (const [code, address, lat, lng] of rows) {
    codes.push(code);
    const data = {
      city: cityOf(address),
      address,
      isActive: true,
      // Координаты приходят из geocode-europost.mjs. Их отсутствие не мешает
      // выбрать отделение — просто не будет булавки на карте.
      //
      // Пустое значение записываем явно, а не пропускаем: справочник в репо —
      // единственный источник правды по координатам. Пропуская null, мы
      // оставляли бы в базе прежнюю точку, даже когда выяснилось, что она
      // ошибочна. Отделения, размеченные ночной задачей, она же и восстановит
      // в ближайшие сутки.
      latitude: lat ?? null,
      longitude: lng ?? null,
    };
    const existing = await prisma.europostOffice.findUnique({ where: { code } });
    if (existing) {
      await prisma.europostOffice.update({ where: { code }, data });
      updated++;
    } else {
      await prisma.europostOffice.create({ data: { code, ...data } });
      added++;
    }
  }

  // Закрытые отделения оставляем в базе: на них ссылаются старые заказы.
  const closed = await prisma.europostOffice.updateMany({
    where: { code: { notIn: codes }, isActive: true },
    data: { isActive: false },
  });

  console.log(
    `✅ Заведено: ${added}, обновлено: ${updated}` +
      (closed.count > 0 ? `, помечено закрытыми: ${closed.count}` : ""),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
