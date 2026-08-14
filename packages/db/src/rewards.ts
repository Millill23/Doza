import { prisma } from "./index";
import { earnPoints } from "./loyalty";
import {
  REWARD_DEFAULTS,
  REWARD_SETTINGS,
  rewardWindow,
  issueYearFor,
  isBirthdayToday,
  occasionKey,
  isRewardUsable,
  atMidnight,
  todayInMinsk,
} from "./reward-rules";

/**
 * Подарки по датам: баллы на день рождения и разовая скидка к памятной дате.
 *
 * Выдаёт ежедневная задача. Она идемпотентна по построению: на каждый повод
 * заводится запись с уникальным ключом `occasionKey`, поэтому повторный запуск
 * (а задача дёргается ежечасно) ничего не продублирует.
 *
 * Правила дат и окон — в `reward-rules.ts`.
 */

export * from "./reward-rules";

async function setting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function rewardConfig() {
  const [birthdayPoints, datePercent, daysBefore, daysAfter] = await Promise.all([
    setting(REWARD_SETTINGS.birthdayPoints, REWARD_DEFAULTS.birthdayPoints),
    setting(REWARD_SETTINGS.datePercent, REWARD_DEFAULTS.datePercent),
    setting(REWARD_SETTINGS.daysBefore, REWARD_DEFAULTS.daysBefore),
    setting(REWARD_SETTINGS.daysAfter, REWARD_DEFAULTS.daysAfter),
  ]);
  return { birthdayPoints, datePercent, daysBefore, daysAfter };
}

export interface IssuedReward {
  customerId: number;
  customerName: string;
  phone: string;
  kind: "birthday" | "memorable";
  /** Описание памятной даты (для SMS). */
  description?: string;
  percent?: number;
  points?: number;
  validUntil?: Date;
}

/**
 * Выдать подарки за сегодняшний день.
 *
 * Возвращает только реально созданные награды — по ним вызывающий код шлёт
 * SMS. Уже выданные молча пропускаются, поэтому сообщения не дублируются.
 */
export async function issueTodayRewards(
  today = todayInMinsk(),
): Promise<IssuedReward[]> {
  const cfg = await rewardConfig();
  const issued: IssuedReward[] = [];

  // ─── Дни рождения ────────────────────────────────────────────────────────
  // Согласие обязательно: подарок — это часть программы лояльности, а не
  // исполнение договора. Без согласия `earnPoints` всё равно откажет.
  const withBirthday = await prisma.customer.findMany({
    where: { birthday: { not: null }, consentStatus: "confirmed" },
    select: { id: true, name: true, phone: true, birthday: true },
  });

  for (const c of withBirthday) {
    if (!c.birthday || !isBirthdayToday(c.birthday, today)) continue;
    const key = occasionKey("birthday", today.getFullYear());
    const w = rewardWindow(c.birthday, today.getFullYear(), 0, 0);


    // Создание записи и есть защита от повтора: уникальный ключ не даст
    // начислить баллы дважды, даже если задача выполнится параллельно.
    let created;
    try {
      created = await prisma.dateReward.create({
        data: {
          customerId: c.id,
          kind: "birthday",
          occasionKey: key,
          pointsByn: cfg.birthdayPoints,
          validFrom: w.validFrom,
          validUntil: w.validUntil,
          usedAt: new Date(),
        },
      });
    } catch {
      continue; // уже выдавали сегодня
    }

    const days = await setting("loyalty_days", 180);
    const ok = await earnPoints(c.id, cfg.birthdayPoints, days, {
      type: "birthday",
      id: created.id,
    });
    if (!ok) {
      // Баллы не начислились — снимаем запись, чтобы подарок не пропал совсем.
      await prisma.dateReward.delete({ where: { id: created.id } });
      continue;
    }

    issued.push({
      customerId: c.id,
      customerName: c.name,
      phone: c.phone,
      kind: "birthday",
      points: cfg.birthdayPoints,
    });
  }

  // ─── Памятные даты ───────────────────────────────────────────────────────
  const dates = await prisma.customerDate.findMany({
    where: { customer: { consentStatus: "confirmed" } },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });

  for (const dt of dates) {
    const year = issueYearFor(dt.date, today, cfg.daysBefore);
    if (year === null) continue;

    const w = rewardWindow(dt.date, year, cfg.daysBefore, cfg.daysAfter);
    try {
      await prisma.dateReward.create({
        data: {
          customerId: dt.customerId,
          kind: "memorable",
          customerDateId: dt.id,
          occasionKey: occasionKey("memorable", year, dt.id),
          percent: cfg.datePercent,
          validFrom: w.validFrom,
          validUntil: w.validUntil,
        },
      });
    } catch {
      continue; // уже выдавали в этом году
    }

    issued.push({
      customerId: dt.customerId,
      customerName: dt.customer.name,
      phone: dt.customer.phone,
      kind: "memorable",
      description: dt.description,
      percent: cfg.datePercent,
      validUntil: w.validUntil,
    });
  }

  return issued;
}

export interface ActiveReward {
  id: number;
  percent: number;
  description: string;
  validUntil: Date;
}

/**
 * Действующая неиспользованная скидка клиента.
 *
 * Если их вдруг несколько (две памятные даты рядом), берём ту, что сгорает
 * раньше — иначе ближняя пропадёт, пока покупатель тратит дальнюю.
 */
export async function activeDateReward(
  customerId: number,
  now = new Date(),
): Promise<ActiveReward | null> {
  const rows = await prisma.dateReward.findMany({
    where: {
      customerId,
      kind: "memorable",
      usedAt: null,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
    include: { customerDate: { select: { description: true } } },
    orderBy: { validUntil: "asc" },
  });

  const usable = rows.find((r) => isRewardUsable(r, now));
  if (!usable) return null;
  return {
    id: usable.id,
    percent: Number(usable.percent ?? 0),
    description: usable.customerDate?.description ?? "памятная дата",
    validUntil: usable.validUntil,
  };
}

/**
 * Пометить скидку использованной.
 *
 * Условный UPDATE (…WHERE used_at IS NULL) — защита от гонки: если два
 * продавца одновременно пробьют чек по одному клиенту, скидку спишет только
 * один, а второй получит false и не даст её дважды.
 */
export async function consumeDateReward(
  rewardId: number,
  saleId: number,
): Promise<boolean> {
  const res = await prisma.dateReward.updateMany({
    where: { id: rewardId, usedAt: null },
    data: { usedAt: new Date(), usedSaleId: saleId },
  });
  return res.count === 1;
}

/** Вернуть скидку клиенту — при отмене продажи. */
export async function releaseDateReward(saleId: number): Promise<void> {
  await prisma.dateReward.updateMany({
    where: { usedSaleId: saleId },
    data: { usedAt: null, usedSaleId: null },
  });
}

/** Ближайшие даты клиента для карточки в CRM. */
export async function customerRewards(customerId: number) {
  return prisma.dateReward.findMany({
    where: { customerId },
    include: { customerDate: { select: { description: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/** Сегодняшняя граница дня — для отчётов задачи. */
export const startOfToday = () => atMidnight(new Date());
