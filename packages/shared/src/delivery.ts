/**
 * Данные посылки: области, индекс, ФИО получателя.
 *
 * Чистая логика без БД — те же правила должны действовать и в браузере (чтобы
 * подсказать сразу), и на сервере (потому что браузеру верить нельзя).
 */

/** Области Беларуси плюс Минск: почта требует область на бланке. */
export const BELARUS_REGIONS = [
  "г. Минск",
  "Брестская область",
  "Витебская область",
  "Гомельская область",
  "Гродненская область",
  "Минская область",
  "Могилёвская область",
] as const;

export type BelarusRegion = (typeof BELARUS_REGIONS)[number];

export function isBelarusRegion(value: string): value is BelarusRegion {
  return (BELARUS_REGIONS as readonly string[]).includes(value);
}

/** Почтовый индекс Беларуси — ровно шесть цифр. */
export function isValidPostalCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export interface DeliveryDetails {
  lastName: string;
  firstName: string;
  middleName: string;
  postalCode: string;
  region: string;
  city: string;
  address: string;
}

/**
 * Проверить данные для отправки почтой.
 *
 * Отчество обязательно наравне с именем и фамилией: и Европочта, и Белпочта
 * требуют полное ФИО получателя, а посылку без него на выдаче не отдадут.
 *
 * Возвращает текст ошибки или `null`, если всё в порядке.
 */
export function validateDelivery(d: Partial<DeliveryDetails>): string | null {
  const has = (v?: string) => (v ?? "").trim().length > 0;

  if (!has(d.lastName)) return "Укажите фамилию получателя";
  if (!has(d.firstName)) return "Укажите имя получателя";
  if (!has(d.middleName)) return "Укажите отчество получателя";
  if (!isValidPostalCode(d.postalCode ?? ""))
    return "Почтовый индекс — шесть цифр, например 220030";
  if (!isBelarusRegion((d.region ?? "").trim())) return "Выберите область";
  if (!has(d.city)) return "Укажите населённый пункт";
  if (!has(d.address)) return "Укажите улицу, дом и квартиру";

  return null;
}

/** Нормализовать данные перед сохранением: лишние пробелы почте ни к чему. */
export function normalizeDelivery(d: DeliveryDetails): DeliveryDetails {
  const t = (v: string) => v.trim().replace(/\s+/g, " ");
  return {
    lastName: t(d.lastName),
    firstName: t(d.firstName),
    middleName: t(d.middleName),
    postalCode: d.postalCode.trim(),
    region: t(d.region),
    city: t(d.city),
    address: t(d.address),
  };
}
