/**
 * Расстояние между точками на земле.
 *
 * Чистая математика без зависимостей: считать её «на глазок» через разницу
 * координат нельзя — на широте Беларуси градус долготы почти вдвое короче
 * градуса широты, и ближайшее отделение оказалось бы не тем.
 */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Расстояние по большому кругу, км. */
export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Расстояние словами: «800 м», «3,4 км», «120 км».
 *
 * Метры до километра и десятые доли до десяти: «0,8 км» человек переводит в
 * шаги хуже, чем «800 м», а «3,42 км» — лишняя точность для выбора отделения.
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} км`;
  return `${Math.round(km)} км`;
}
