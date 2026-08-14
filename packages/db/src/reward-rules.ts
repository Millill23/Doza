/**
 * Правила подарков по датам: день рождения и памятные даты.
 * Чистая логика без БД — календарные хитрости здесь легко покрыть тестами.
 */

/** Значения по умолчанию; админ может переопределить их в настройках. */
export const REWARD_DEFAULTS = {
  /** Баллы в подарок на день рождения. */
  birthdayPoints: 10,
  /** Скидка по памятной дате, %. */
  datePercent: 15,
  /** За сколько дней до даты открывается скидка. */
  daysBefore: 3,
  /** Сколько дней после даты она ещё действует. */
  daysAfter: 7,
} as const;

/** Ключи настроек, которыми это меняется без правки кода. */
export const REWARD_SETTINGS = {
  birthdayPoints: "birthday_points",
  datePercent: "date_discount_percent",
  daysBefore: "date_discount_days_before",
  daysAfter: "date_discount_days_after",
} as const;

/**
 * Часовой пояс магазина. Всё, что связано с датами подарков, считается по
 * Минску, а не по времени сервера: в контейнере по умолчанию UTC, и «сегодня»
 * там наступает на три часа позже — поздравление ушло бы не в тот день.
 * Беларусь с 2011 года живёт без перевода часов, но пояс задаём именем, а не
 * смещением: если правило once поменяется, `Intl` учтёт это сам.
 */
export const MINSK_TZ = "Europe/Minsk";

/** Час подарочной рассылки по Минску. */
export const REWARD_NOTIFY_HOUR = 11;

/** Части даты по минскому времени. */
function minskParts(at: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MINSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

/** Текущий час по Минску (0–23). */
export function minskHour(at = new Date()): number {
  return minskParts(at).hour;
}

/**
 * Сегодняшний календарный день по Минску.
 *
 * Возвращает дату-метку дня: время в ней не значимо, сравниваются только год,
 * месяц и число — именно так её используют остальные функции модуля.
 */
export function todayInMinsk(at = new Date()): Date {
  const { year, month, day } = minskParts(at);
  return new Date(year, month - 1, day);
}

/** Пора ли рассылать подарки: ровно в назначенный час по Минску. */
export function isRewardNotifyHour(at = new Date()): boolean {
  return minskHour(at) === REWARD_NOTIFY_HOUR;
}

/** Календарный день без времени. */
export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Годовщина даты в заданном году.
 *
 * День и месяц исходной даты читаем в UTC: колонки типа `date` возвращаются
 * полуночью UTC, и локальные геттеры на отрицательном смещении дали бы
 * предыдущие сутки — поздравление уехало бы на день. Результат при этом
 * строим в локальном времени, потому что «сегодня» для магазина местное.
 *
 * 29 февраля в невисокосный год отмечаем 28-го: иначе `new Date(2027, 1, 29)`
 * молча станет 1 марта, а в високосный год подарков было бы два подряд.
 */
export function anniversaryIn(source: Date, year: number): Date {
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  if (month === 1 && day === 29) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return new Date(year, 1, isLeap ? 29 : 28);
  }
  return new Date(year, month, day);
}

export interface RewardWindow {
  /** Год годовщины — он же часть ключа повода. */
  year: number;
  anniversary: Date;
  validFrom: Date;
  validUntil: Date;
}

/**
 * Окно скидки вокруг годовщины: `daysBefore` до и `daysAfter` после.
 * Конец окна — последний день целиком, поэтому берём его 23:59:59.
 */
export function rewardWindow(
  source: Date,
  year: number,
  daysBefore: number,
  daysAfter: number,
): RewardWindow {
  const anniversary = anniversaryIn(source, year);
  const validFrom = addDays(anniversary, -Math.abs(daysBefore));
  const endDay = addDays(anniversary, Math.abs(daysAfter));
  const validUntil = new Date(
    endDay.getFullYear(),
    endDay.getMonth(),
    endDay.getDate(),
    23,
    59,
    59,
    999,
  );
  return { year, anniversary, validFrom, validUntil };
}

/**
 * За какой год выдавать награду, если задача выполняется сегодня.
 *
 * Возвращает год годовщины или null, если сегодня не день выдачи. Проверяем
 * и текущий год, и следующий: у даты 2 января окно открывается 30 декабря —
 * то есть ещё в прошлом году по календарю.
 */
export function issueYearFor(
  source: Date,
  today: Date,
  daysBefore: number,
): number | null {
  const day = atMidnight(today);
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const start = atMidnight(addDays(anniversaryIn(source, year), -Math.abs(daysBefore)));
    if (start.getTime() === day.getTime()) return year;
  }
  return null;
}

/** Сегодня ли день рождения (с поправкой на 29 февраля). */
export function isBirthdayToday(birthday: Date, today: Date): boolean {
  return (
    atMidnight(anniversaryIn(birthday, today.getFullYear())).getTime() ===
    atMidnight(today).getTime()
  );
}

/** Ключ повода: одна награда на повод в год. */
export function occasionKey(
  kind: "birthday" | "memorable",
  year: number,
  customerDateId?: number | null,
): string {
  return kind === "birthday" ? `birthday-${year}` : `date-${customerDateId}-${year}`;
}

export interface RewardLike {
  usedAt: Date | null;
  validFrom: Date;
  validUntil: Date;
}

/** Скидку можно применить: не использована и срок не вышел. */
export function isRewardUsable(reward: RewardLike, now = new Date()): boolean {
  if (reward.usedAt) return false;
  return now >= reward.validFrom && now <= reward.validUntil;
}

/** Сколько дней осталось до конца срока (0 — сегодня последний). */
export function daysLeft(reward: RewardLike, now = new Date()): number {
  const end = atMidnight(reward.validUntil).getTime();
  const today = atMidnight(now).getTime();
  return Math.max(0, Math.round((end - today) / 86_400_000));
}
