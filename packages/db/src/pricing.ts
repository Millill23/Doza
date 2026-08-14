/**
 * Расчёт скидок по чеку.
 *
 * Главное правило бизнеса: **акции не складываются**. Позиция никогда не получает
 * сумму нескольких процентов — только один, самый выгодный для покупателя.
 * Механика «каждый N-й товар бесплатно» (супер-акция) считается отдельным
 * сценарием и сравнивается с процентным по итоговой сумме — побеждает та,
 * где покупатель платит меньше.
 *
 * Чистый модуль без обращений к БД: данные готовит вызывающий код.
 */

/** Позиция чека. */
export interface PricingLine {
  productId: number;
  qty: number;
  /** Цена за единицу до скидок. */
  unitPrice: number;
}

/** Правило супер-акции «1+1=3»: каждый `groupSize`-й товар бесплатно. */
export interface SuperPromoRule {
  groupSize: number;
  /** Участвует ли товар в акции (false → не считается в группе и не может стать бесплатным). */
  isEligible(productId: number): boolean;
}

export interface PricingInput {
  lines: PricingLine[];
  /** Скидка по VIP-карте, %. 0 — клиент не VIP. */
  vipPercent?: number;
  /** Скидка за подписку/сторис, % (суммарно за обе). 0 — нет. */
  socialPercent?: number;
  /**
   * Скидка по памятной дате, %. Передаётся, только если продавец её применил:
   * покупатель вправе отказаться и приберечь на потом.
   */
  datePercent?: number;
  /** Лучшая активная акция на конкретный товар, % (ключ — productId). */
  productPromoPercent?: Record<number, number>;
  /** Акция «на все товары», % — применяется к любой позиции. */
  allProductsPromoPercent?: number;
  /** Активная супер-акция или null. */
  superPromo?: SuperPromoRule | null;
}

/** Какая механика в итоге дала скидку (для журнала и отчётов). */
export type DiscountKind = "none" | "vip" | "social" | "date" | "promo" | "super";

export interface PricingResult {
  /** Сумма без скидок. */
  gross: number;
  /** Сумма к оплате. */
  net: number;
  /** Размер скидки (gross − net). */
  discount: number;
  kind: DiscountKind;
  /** Итог по каждой позиции, в порядке входных `lines`. */
  lineNet: number[];
  /** Сколько единиц товара ушло бесплатно по супер-акции. */
  freeUnits: number;
}

/** Округление денег до копеек. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Эффективный процент кешбека на товар.
 *
 * Единый источник правды для витрины и касс: сколько сайт обещает в карточке
 * товара, столько же должно начислиться при продаже. Берётся максимум —
 * повышенный кешбек акции не складывается с базовым, а заменяет его.
 */
export function effectiveCashbackPercent(opts: {
  /** Базовый процент из настроек (loyalty_percent). */
  globalPercent: number;
  /** Персональный процент товара (loyaltyPercentOverride). */
  productOverride?: number | null;
  /** Повышенный кешбек активной акции. */
  promoCashbackPercent?: number | null;
}): number {
  return Math.max(
    opts.globalPercent || 0,
    opts.productOverride ?? 0,
    opts.promoCashbackPercent ?? 0,
  );
}

function clampPercent(p: number | undefined): number {
  if (!Number.isFinite(p as number) || (p as number) <= 0) return 0;
  return Math.min(100, p as number);
}

/** Процент акции именно на этот товар (макс. из «на все товары» и адресной). */
function promoFor(input: PricingInput, productId: number): number {
  const own = input.productPromoPercent?.[productId] ?? 0;
  return Math.max(clampPercent(input.allProductsPromoPercent), clampPercent(own));
}

/** Цена единицы после процентной скидки (совпадает с прежней логикой кассы). */
function unitAfter(unitPrice: number, percent: number): number {
  return r2(unitPrice * (1 - percent / 100));
}

/**
 * Сценарий «процент»: на каждую позицию — максимум из VIP, соцскидки и акции
 * товара. Именно максимум, а не сумма: проценты не складываются.
 */
function percentScenario(
  input: PricingInput,
  opts: { vip: number; social: number; date: number },
): { lineNet: number[]; total: number } {
  const lineNet: number[] = [];
  let total = 0;
  for (const l of input.lines) {
    const pct = Math.max(opts.vip, opts.social, opts.date, promoFor(input, l.productId));
    const sum = r2(unitAfter(l.unitPrice, pct) * l.qty);
    lineNet.push(sum);
    total += sum;
  }
  return { lineNet, total: r2(total) };
}

/**
 * Сценарий «супер-акция»: действуют только адресные акции товара, а затем
 * каждая `groupSize`-я единица среди участвующих становится бесплатной —
 * бесплатными выбираются самые дешёвые единицы.
 * VIP и соцскидка сюда намеренно не входят — они с этой механикой не сочетаются.
 */
function superScenario(
  input: PricingInput,
  rule: SuperPromoRule,
): { lineNet: number[]; total: number; freeUnits: number } {
  const lineNet: number[] = [];
  const units: { lineIndex: number; price: number }[] = [];

  input.lines.forEach((l, i) => {
    const pct = promoFor(input, l.productId);
    const unit = unitAfter(l.unitPrice, pct);
    lineNet.push(r2(unit * l.qty));
    if (rule.isEligible(l.productId)) {
      for (let k = 0; k < l.qty; k++) units.push({ lineIndex: i, price: unit });
    }
  });

  const groupSize = Math.max(2, Math.floor(rule.groupSize || 3));
  const freeUnits = Math.floor(units.length / groupSize);
  if (freeUnits > 0) {
    units.sort((a, b) => a.price - b.price);
    for (let i = 0; i < freeUnits; i++) {
      const u = units[i];
      lineNet[u.lineIndex] = r2(lineNet[u.lineIndex] - u.price);
    }
  }

  const total = r2(lineNet.reduce((s, v) => s + v, 0));
  return { lineNet, total, freeUnits };
}

/**
 * Посчитать чек: выбирается сценарий, при котором покупатель платит меньше.
 */
export function priceCart(input: PricingInput): PricingResult {
  const lines = input.lines.filter((l) => l.qty > 0 && l.unitPrice >= 0);
  const safe: PricingInput = { ...input, lines };

  const gross = r2(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  if (lines.length === 0) {
    return { gross: 0, net: 0, discount: 0, kind: "none", lineNet: [], freeUnits: 0 };
  }

  const vip = clampPercent(input.vipPercent);
  const social = clampPercent(input.socialPercent);
  const date = clampPercent(input.datePercent);

  const withAll = percentScenario(safe, { vip, social, date });
  // Базовый сценарий — только акции товаров. Нужен, чтобы понять, дал ли
  // выигрыш именно персональная скидка, или всё сделала обычная акция.
  const promoOnly = percentScenario(safe, { vip: 0, social: 0, date: 0 });

  let best = { lineNet: withAll.lineNet, total: withAll.total, freeUnits: 0 };
  let kind: DiscountKind;

  if (withAll.total < promoOnly.total) {
    // При равных процентах побеждает механика, которая ничего не тратит:
    // скидка по дате одноразовая, и списывать её ради того же результата,
    // что даёт VIP-карта, — значит обокрасть покупателя.
    const bestPct = Math.max(vip, social, date);
    kind = bestPct === vip ? "vip" : bestPct === social ? "social" : "date";
  } else {
    kind = promoOnly.total < gross ? "promo" : "none";
  }

  if (input.superPromo) {
    const sup = superScenario(safe, input.superPromo);
    if (sup.total < best.total) {
      best = sup;
      kind = "super";
    }
  }

  const net = r2(best.total);
  return {
    gross,
    net,
    discount: r2(gross - net),
    kind,
    lineNet: best.lineNet,
    freeUnits: best.freeUnits,
  };
}
