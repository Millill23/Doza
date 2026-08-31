"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createOfflineSale,
  lookupCustomer,
  requestLoyaltySpendOtp,
  checkCertificate,
} from "@/lib/actions/cash";
import { applyCertificate, daysLeft } from "@doza/db/certificate-rules";
import PhoneInput from "@/components/PhoneInput";
import { ConsentRequestButton } from "@/components/ConsentControls";
import {
  BELARUS_PREFIX,
  isValidLocalDigits,
  PHONE_ERROR,
} from "@doza/shared/phone";
// Тот же движок, что и на сервере — предпросмотр обязан совпадать с чеком.
import { priceCart } from "@doza/db/pricing";

interface VolumeOpt {
  volumeMl: number;
  priceByn: number;
}
interface ProductOpt {
  id: number;
  name: string;
  brand: string;
  discountPercent: number;
  /** Участвует ли товар в текущей супер-акции. */
  inSuperPromo?: boolean;
  volumes: VolumeOpt[];
}
interface SellerOpt {
  id: number;
  name: string;
}
interface AtomizerOpt {
  id: number;
  name: string;
  volumeMl: number;
}
interface CartLine {
  productId: number;
  label: string;
  volumeMl: number;
  priceByn: number;
  qty: number;
  promoDiscount: number;
  inSuperPromo: boolean;
  atomizerId: number | null;
}

function byn(n: number) {
  return `${n.toFixed(2)} BYN`;
}

/** Название сработавшей механики скидки — для строки «Скидка (…)». */
const DISCOUNT_LABEL: Record<string, string> = {
  vip: "VIP",
  social: "за подписки",
  date: "по памятной дате",
  promo: "акция",
  promocode: "промокод",
  remnant: "остаток во флаконе",
  super: "супер-акция",
  none: "",
};

function chipCls(active: boolean) {
  return `rounded-full border px-3 py-1 text-xs transition-colors ${
    active
      ? "border-gold-500 bg-gold-500/15 text-gold-300"
      : "border-ink-600 text-ivory-muted hover:border-gold-500 hover:text-gold-300"
  }`;
}

export default function CashRegister({
  products,
  atomizers,
  superPromo = null,
  sellers = [],
  currentUserId,
  subscribePercent = 5,
  storyPercent = 5,
  remnantPercent = 20,
  promoCodes = [],
}: {
  products: ProductOpt[];
  atomizers: AtomizerOpt[];
  superPromo?: { name: string; groupSize: number } | null;
  /** Непустой список = текущий пользователь админ и может выбрать продавца. */
  sellers?: SellerOpt[];
  currentUserId: number;
  subscribePercent?: number;
  storyPercent?: number;
  remnantPercent?: number;
  promoCodes?: {
    code: string;
    comment: string | null;
    discountPercent: number;
    influencer: string | null;
  }[];
}) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  /** Локальная часть номера (9 цифр), префикс +375 добавляется при отправке. */
  const [phone, setPhone] = useState("");
  const [balance, setBalance] = useState(0);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [foundId, setFoundId] = useState<number | null>(null);
  /** Найденный клиент не подтвердил согласие — баллы ему не начислятся. */
  const [needsConsent, setNeedsConsent] = useState(false);
  /** Действующая разовая скидка клиента по памятной дате. */
  const [dateReward, setDateReward] = useState<{
    percent: number;
    description: string;
    validUntil: string;
  } | null>(null);
  /** Покупатель согласился её потратить сейчас. */
  const [useDate, setUseDate] = useState(false);
  /** Искали и не нашли — предлагаем зарегистрировать. */
  const [notFound, setNotFound] = useState(false);
  const [vipCard, setVipCard] = useState<string | null>(null);
  const [vipPercent, setVipPercent] = useState(0);
  const [subscribe, setSubscribe] = useState(false);
  const [story, setStory] = useState(false);
  /** Флакон почти пуст — продавец отдаёт остаток дешевле. */
  const [remnant, setRemnant] = useState(false);
  /** Промокод покупателя. Продавец выбирает из списка, а не печатает. */
  const [promoCode, setPromoCode] = useState("");
  const [promoQuery, setPromoQuery] = useState("");
  const [sellerId, setSellerId] = useState<number>(currentUserId);
  const [usePoints, setUsePoints] = useState(false);
  const [spend, setSpend] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  /** Код сертификата и результат его проверки. */
  const [certCode, setCertCode] = useState("");
  const [cert, setCert] = useState<{ balance: number; expiresAt: string } | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{
    saleId: number;
    toPay: number;
    discountLabel?: string;
    earned?: number;
    cashbackBlocked?: boolean;
    certPaid?: number;
    certRemaining?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const brands = useMemo(
    () =>
      [...new Set(products.map((p) => p.brand))].sort((a, b) =>
        a.localeCompare(b, "ru"),
      ),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products;
    if (brandFilter) list = list.filter((p) => p.brand === brandFilter);
    if (q)
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
      );
    if (!q && !brandFilter) return list.slice(0, 8);
    return list.slice(0, 60);
  }, [query, brandFilter, products]);

  const socialPercent = (subscribe ? subscribePercent : 0) + (story ? storyPercent : 0);

  // Расчёт тем же движком, что и на сервере: акции не складываются,
  // выигрывает вариант, выгодный покупателю.
  const priced = useMemo(() => {
    const promoMap: Record<number, number> = {};
    for (const l of cart) {
      promoMap[l.productId] = Math.max(
        promoMap[l.productId] ?? 0,
        l.promoDiscount || 0,
      );
    }
    const eligible = new Set(
      cart.filter((l) => l.inSuperPromo).map((l) => l.productId),
    );
    return priceCart({
      lines: cart.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.priceByn,
      })),
      vipPercent,
      socialPercent,
      datePercent: useDate ? (dateReward?.percent ?? 0) : 0,
      remnantPercent: remnant ? remnantPercent : 0,
      promoCodePercent:
        promoCodes.find((c) => c.code === promoCode)?.discountPercent ?? 0,
      productPromoPercent: promoMap,
      superPromo: superPromo
        ? {
            groupSize: superPromo.groupSize,
            isEligible: (id: number) => eligible.has(id),
          }
        : null,
    });
  }, [
    cart,
    vipPercent,
    socialPercent,
    useDate,
    dateReward,
    superPromo,
    remnant,
    remnantPercent,
    promoCode,
    promoCodes,
  ]);

  const total = priced.gross;
  const netTotal = priced.net;
  const netAll = netTotal;
  const discount = Math.round((total - netTotal) * 100) / 100;
  const maxSpend = Math.min(balance, netAll);
  const effSpend = usePoints ? Math.min(spend || maxSpend, maxSpend) : 0;
  const dueAfterPoints = Math.max(0, Math.round((netAll - effSpend) * 100) / 100);

  // Тот же расчёт, что и на сервере: продавец должен видеть остаток заранее и
  // назвать его покупателю, а не узнавать после закрытия чека.
  const certUse = cert
    ? applyCertificate({ balance: cert.balance, due: dueAfterPoints })
    : null;
  const toPay = certUse ? certUse.toPay : dueAfterPoints;

  function addLine(p: ProductOpt, v: VolumeOpt) {
    setCart((prev) => {
      const i = prev.findIndex(
        (l) => l.productId === p.id && l.volumeMl === v.volumeMl,
      );
      if (i >= 0) {
        const next = prev.slice();
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      const match = atomizers.filter((a) => a.volumeMl === v.volumeMl);
      return [
        ...prev,
        {
          productId: p.id,
          label: `${p.brand} ${p.name}`,
          volumeMl: v.volumeMl,
          priceByn: v.priceByn,
          qty: 1,
          promoDiscount: p.discountPercent || 0,
          inSuperPromo: p.inSuperPromo === true,
          atomizerId: match.length === 1 ? match[0].id : null,
        },
      ];
    });
  }

  function setQty(idx: number, qty: number) {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((_, i) => i !== idx);
      const next = prev.slice();
      next[idx] = { ...next[idx], qty };
      return next;
    });
  }

  function setAtomizer(idx: number, atomizerId: number | null) {
    setCart((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], atomizerId };
      return next;
    });
  }

  function checkPhone() {
    if (!isValidLocalDigits(phone)) {
      setError(PHONE_ERROR);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await lookupCustomer(BELARUS_PREFIX + phone);
      setBalance(r.balance);
      setFoundName(r.found ? r.name : null);
      setFoundId(r.id);
      setNeedsConsent(r.found && !r.hasConsent);
      setDateReward(r.dateReward);
      setUseDate(false);
      setNotFound(!r.found);
      setVipCard(r.vipCard ?? null);
      setVipPercent(r.vipPercent ?? 0);
    });
  }

  function sendOtp() {
    setError(null);
    startTransition(async () => {
      try {
        // Номер уходит в полном виде: в поле лежат только девять цифр.
        const r = await requestLoyaltySpendOtp(BELARUS_PREFIX + phone, effSpend);
        if (!r.ok) {
          setError(r.error ?? "Не удалось отправить код");
          return;
        }
        setOtpSent(true);
        if (!r.smsSent)
          setError("Код не отправлен: проверьте настройки SMS в разделе «SMS-рассылки».");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function resetCart() {
    setCart([]);

    setPhone("");
    setBalance(0);
    setFoundName(null);
    setFoundId(null);
    setNeedsConsent(false);
    setNotFound(false);
    setDateReward(null);
    setUseDate(false);
    setVipCard(null);
    setVipPercent(0);
    setSubscribe(false);
    setStory(false);
    setRemnant(false);
    setPromoCode("");
    setPromoQuery("");
    setUsePoints(false);
    setSpend(0);
    setOtp("");
    setOtpSent(false);
    setCertCode("");
    setCert(null);
    setCertError(null);
  }

  function findCertificate() {
    setCertError(null);
    startTransition(async () => {
      const r = await checkCertificate(certCode);
      if (!r.ok) {
        setCert(null);
        setCertError(r.reason ?? "Сертификат недоступен");
        return;
      }
      setCert({ balance: r.balance!, expiresAt: r.expiresAt! });
    });
  }

  function closeSale() {
    setError(null);
    if (effSpend > 0 && !otp.trim()) {
      setError("Введите код подтверждения списания баллов из SMS");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createOfflineSale({
          items: cart.map((l) => ({
            productId: l.productId,
            volumeMl: l.volumeMl,
            qty: l.qty,
            atomizerId: l.atomizerId,
          })),

          // Отправляем номер, только если клиент реально найден: касса больше
          // не заводит клиентов на лету — регистрация живёт в одном месте.
          phone: foundName ? BELARUS_PREFIX + phone : undefined,
          loyaltySpend: effSpend,
          loyaltyOtp: otp || undefined,
          remnant,
          promoCode,
          socialSubscribe: subscribe,
          socialStory: story,
          useDateReward: useDate,
          certificateCode: cert ? certCode : undefined,
          sellerId,
        });
        setDone({
          saleId: res.saleId,
          toPay: res.toPay,
          discountLabel: res.discountLabel,
          earned: res.earned,
          cashbackBlocked: res.cashbackBlocked,
          certPaid: res.certPaid,
          certRemaining: res.certRemaining,
        });
        resetCart();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-green-500/40 bg-green-500/5 p-8 text-center">
        <h2 className="mb-2 font-serif text-2xl text-green-300">Продажа закрыта</h2>
        <p className="mb-1 text-ivory-muted">Продажа №{done.saleId}</p>
        <p className="mb-1 text-ivory">Оплачено: {byn(done.toPay)}</p>
        {done.certPaid ? (
          <p className="mb-1 text-sm text-botanical-300">
            Сертификатом: {byn(done.certPaid)} · остаток{" "}
            <b>{byn(done.certRemaining ?? 0)}</b>
            {done.certRemaining
              ? " — скажите покупателю, он потратит его в следующий раз"
              : " — сертификат израсходован"}
          </p>
        ) : null}
        {done.discountLabel && (
          <p className="mb-1 text-sm text-botanical-300">
            Применена скидка: {done.discountLabel}
          </p>
        )}
        {done.cashbackBlocked ? (
          <p className="mx-auto mb-6 max-w-sm rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-relaxed text-amber-300">
            Баллы не начислены: клиент не подтвердил согласие на обработку
            персональных данных. Попросите открыть ссылку из SMS.
          </p>
        ) : done.earned ? (
          <p className="mb-6 text-sm text-gold-400">
            Начислено баллов: {done.earned}
          </p>
        ) : (
          <p className="mb-6" />
        )}
        <button
          onClick={() => setDone(null)}
          className="rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900"
        >
          Новая продажа
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Выбор товара */}
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск товара по бренду или названию…"
          className="mb-3 h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-4 text-sm text-ivory focus:border-gold-500 focus:outline-none"
        />
        {/* Быстрые кнопки брендов */}
        <div className="mb-4 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          <button
            onClick={() => setBrandFilter(null)}
            className={chipCls(!brandFilter)}
          >
            Все
          </button>
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => setBrandFilter(brandFilter === b ? null : b)}
              className={chipCls(brandFilter === b)}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border border-ink-600/60 bg-ink-700 p-4">
              <div className="mb-2">
                <span className="text-[11px] uppercase tracking-wide text-gold-500">
                  {p.brand}
                </span>
                <div className="font-serif text-base text-ivory">{p.name}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.volumes.map((v) => (
                  <button
                    key={v.volumeMl}
                    onClick={() => addLine(p, v)}
                    className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-300"
                  >
                    {v.volumeMl} мл · {byn(v.priceByn)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Корзина и закрытие */}
      <div className="space-y-4 rounded-2xl border border-ink-600/60 bg-ink-700 p-5 lg:sticky lg:top-8 lg:self-start">
        <h2 className="font-serif text-xl text-ivory">Чек</h2>

        {cart.length === 0 ? (
          <p className="text-sm text-ivory-faint">Добавьте товары из списка.</p>
        ) : (
          <ul className="space-y-2">
            {cart.map((l, idx) => (
              <li key={`${l.productId}-${l.volumeMl}`} className="rounded-lg border border-ink-600/40 px-2 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex-1">
                    <div className="text-ivory">{l.label}</div>
                    <div className="text-xs text-ivory-faint">{l.volumeMl} мл · {byn(l.priceByn)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(idx, l.qty - 1)} className="h-7 w-7 rounded border border-ink-600 text-ivory-muted hover:border-gold-500">−</button>
                    <span className="w-6 text-center">{l.qty}</span>
                    <button onClick={() => setQty(idx, l.qty + 1)} className="h-7 w-7 rounded border border-ink-600 text-ivory-muted hover:border-gold-500">+</button>
                  </div>
                  <span className="w-20 text-right text-gold-400">{byn(l.priceByn * l.qty)}</span>
                </div>
                {atomizers.some((a) => a.volumeMl === l.volumeMl) && (
                  <select
                    value={l.atomizerId ?? ""}
                    onChange={(e) =>
                      setAtomizer(idx, e.target.value ? Number(e.target.value) : null)
                    }
                    className="mt-2 h-8 w-full rounded-lg border border-ink-600 bg-ink-800 px-2 text-xs text-ivory focus:border-gold-500 focus:outline-none"
                  >
                    <option value="">Атомайзер {l.volumeMl} мл…</option>
                    {atomizers
                      .filter((a) => a.volumeMl === l.volumeMl)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Клиент */}
        <div className="border-t border-ink-600/60 pt-4">
          <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
            Телефон клиента (для баллов)
          </label>
          <div className="flex gap-2">
            <PhoneInput
              value={phone}
              onChange={(v) => {
                setPhone(v);
                // Номер изменили — прошлый результат поиска больше не про него.
                setFoundName(null);
                setFoundId(null);
                setNeedsConsent(false);
                setNotFound(false);
                setDateReward(null);
                setUseDate(false);
                setVipCard(null);
                setBalance(0);
              }}
              onEnter={checkPhone}
              className="flex-1"
            />
            <button
              onClick={checkPhone}
              disabled={pending}
              className="h-10 shrink-0 rounded-lg border border-gold-600/50 px-3 text-xs text-gold-400 hover:border-gold-500 disabled:opacity-50"
            >
              Найти
            </button>
          </div>
          {foundName && (
            <p className="mt-1.5 text-xs text-botanical-300">
              {foundName}, баланс: {byn(balance)}
              {vipCard && (
                <span className="ml-1 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold text-ink-900">
                  ⭐ VIP №{vipCard} · −{vipPercent}%
                </span>
              )}
            </p>
          )}
          {dateReward && (
            <div className="mt-2 rounded-lg border border-botanical-500/40 bg-botanical-500/5 p-3">
              <p className="text-xs font-medium text-botanical-300">
                🎁 Скидка {dateReward.percent}% — «{dateReward.description}»
              </p>
              <p className="mt-0.5 text-[11px] text-ivory-faint">
                Действует до{" "}
                {new Date(dateReward.validUntil).toLocaleDateString("ru-RU")}.
                Разовая: если покупатель не хочет тратить сейчас, оставьте
                выключенной — скидка сохранится до конца срока.
              </p>
              <button
                type="button"
                onClick={() => setUseDate((v) => !v)}
                className={`mt-2 ${chipCls(useDate)}`}
              >
                {useDate ? "✓ Применена" : `Применить −${dateReward.percent}%`}
              </button>
              {useDate && priced.kind !== "date" && (
                <p className="mt-2 text-[11px] leading-snug text-amber-300">
                  Сейчас выгоднее{" "}
                  {DISCOUNT_LABEL[priced.kind] || "другая скидка"} — эта останется
                  неиспользованной.
                </p>
              )}
            </div>
          )}
          {needsConsent && foundId && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 text-xs leading-relaxed text-amber-300">
                Нет согласия на обработку данных — баллы за эту покупку не
                начислятся. Отправьте ссылку и попросите подтвердить.
              </p>
              <ConsentRequestButton
                customerId={foundId}
                label="Отправить согласие"
              />
            </div>
          )}
          {notFound && (
            <div className="mt-2 rounded-lg border border-gold-600/30 bg-ink-800 p-3">
              <p className="mb-2 text-xs leading-relaxed text-ivory-faint">
                Клиент не найден. Без регистрации продажу пробить можно, но
                баллы начисляться не будут.
              </p>
              <Link
                href={`/customers/register?phone=${phone}`}
                className="inline-flex h-9 items-center rounded-full bg-gold-gradient px-4 text-xs font-medium text-ink-900"
              >
                Зарегистрировать нового клиента
              </Link>
            </div>
          )}
        </div>

        {/* Скидки, которые ставит продавец */}
        <div className="border-t border-ink-600/60 pt-4">
          <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
            Скидки продавца
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubscribe((v) => !v)}
              className={chipCls(subscribe)}
            >
              −{subscribePercent}% подписка
            </button>
            <button
              type="button"
              onClick={() => setStory((v) => !v)}
              className={chipCls(story)}
            >
              −{storyPercent}% сторис
            </button>
            {/* Своя механика: с подписками не складывается, поэтому и стоит
                отдельно, а не третьей кнопкой соцсетей. */}
            <button
              type="button"
              onClick={() => setRemnant((v) => !v)}
              className={chipCls(remnant)}
            >
              −{remnantPercent}% остаток во флаконе
            </button>
          </div>
          {remnant && socialPercent > 0 && (
            <p className="mt-1.5 text-xs text-ivory-faint">
              Остаток не складывается с подписками — применится то, что выгоднее
              клиенту.
            </p>
          )}

          {/* Промокод: продавец выбирает из списка, а не печатает со слов
              покупателя — так не бывает опечаток и «кода, которого нет». */}
          {promoCodes.length > 0 && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
                Промокод
              </label>
              {promoCode ? (
                <div className="flex items-center justify-between rounded-lg border border-gold-500/40 bg-gold-500/5 px-3 py-2">
                  <div>
                    <span className="font-mono text-sm text-gold-300">{promoCode}</span>
                    <span className="ml-2 text-xs text-ivory-faint">
                      −{promoCodes.find((c) => c.code === promoCode)?.discountPercent}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPromoCode("")}
                    className="text-xs text-ivory-faint hover:text-gold-400"
                  >
                    Убрать
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={promoQuery}
                    onChange={(e) => setPromoQuery(e.target.value)}
                    placeholder="Поиск по коду или блогеру"
                    className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
                  />
                  <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                    {promoCodes
                      .filter((c) => {
                        const q = promoQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          c.code.toLowerCase().includes(q) ||
                          (c.influencer ?? "").toLowerCase().includes(q) ||
                          (c.comment ?? "").toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 20)
                      .map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setPromoCode(c.code)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-ivory-muted transition-colors hover:bg-ink-600/40"
                        >
                          <span>
                            <span className="font-mono text-ivory">{c.code}</span>
                            {c.influencer && (
                              <span className="ml-2 text-xs text-ivory-faint">
                                {c.influencer}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-gold-400">
                            −{c.discountPercent}%
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
          {socialPercent > 0 && vipPercent > 0 && (
            <p className="mt-1.5 text-xs text-ivory-faint">
              Не суммируется с VIP — применится то, что выгоднее клиенту.
            </p>
          )}
        </div>

        {/* Продажа от лица сотрудника (только админ) */}
        {sellers.length > 1 && (
          <div className="border-t border-ink-600/60 pt-4">
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
              Продавец
            </label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
            >
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === currentUserId ? " (вы)" : ""}
                </option>
              ))}
            </select>
            {sellerId !== currentUserId && (
              <p className="mt-1.5 text-xs text-botanical-300">
                Продажа будет засчитана этому сотруднику.
              </p>
            )}
          </div>
        )}

        {balance > 0 && (
          <div className="rounded-lg border border-botanical-500/40 bg-botanical-700/20 p-3">
            <label className="flex items-center gap-2 text-sm text-ivory">
              <input
                type="checkbox"
                checked={usePoints}
                onChange={(e) => {
                  setUsePoints(e.target.checked);
                  setOtpSent(false);
                  setOtp("");
                }}
                className="h-4 w-4 accent-botanical-500"
              />
              Списать баллы (до {byn(maxSpend)})
            </label>
            {usePoints && (
              <>
                <input
                  type="number" min={0} max={maxSpend} step="0.01"
                  value={spend || maxSpend}
                  onChange={(e) => { setSpend(Number(e.target.value)); setOtpSent(false); setOtp(""); }}
                  className="mt-2 h-9 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
                />
                {!otpSent ? (
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={pending || effSpend <= 0}
                    className="mt-2 w-full rounded-lg border border-gold-600/50 py-2 text-xs text-gold-400 transition-colors hover:border-gold-500 disabled:opacity-50"
                  >
                    Отправить код клиенту по SMS
                  </button>
                ) : (
                  <div className="mt-2">
                    <input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      inputMode="numeric"
                      placeholder="Код из SMS клиента"
                      className="h-9 w-full rounded-lg border border-gold-600/50 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={pending}
                      className="mt-1 text-xs text-ivory-faint hover:text-gold-400"
                    >
                      Отправить код повторно
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Сертификат. Отдельно от блока баллов: платить им можно и без
            телефона, и без согласия — это средство на предъявителя. */}
        <div className="border-t border-ink-600/60 pt-4">
          <label className="mb-1.5 block text-xs uppercase tracking-wide text-gold-500">
            Сертификат
          </label>
          <div className="flex gap-2">
            <input
              value={certCode}
              onChange={(e) => {
                setCertCode(e.target.value.toUpperCase());
                setCert(null);
                setCertError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && findCertificate()}
              placeholder="ABCD2345"
              maxLength={12}
              className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 font-mono text-sm tracking-[0.2em] text-ivory focus:border-gold-500 focus:outline-none"
            />
            <button
              onClick={findCertificate}
              disabled={pending || !certCode.trim()}
              className="h-10 shrink-0 rounded-lg border border-gold-600/50 px-3 text-xs text-gold-400 hover:border-gold-500 disabled:opacity-50"
            >
              Проверить
            </button>
          </div>
          {certError && (
            <p className="mt-1.5 text-xs text-red-300">{certError}</p>
          )}
          {cert && certUse && (
            <div className="mt-2 rounded-lg border border-botanical-500/40 bg-botanical-500/5 p-3 text-xs">
              <p className="text-botanical-300">
                Остаток на сертификате: {byn(cert.balance)} · сгорает{" "}
                {new Date(cert.expiresAt).toLocaleDateString("ru-RU")} (
                {daysLeft(new Date(cert.expiresAt))} дн.)
              </p>
              <p className="mt-1 text-ivory-faint">
                {certUse.applied > 0
                  ? `Спишем ${byn(certUse.applied)}, останется ${byn(certUse.remaining)} на следующую покупку.`
                  : "Добавьте товары — списывать пока нечего."}
              </p>
            </div>
          )}
        </div>

        {/* Итого */}
        <div className="space-y-1 border-t border-ink-600/60 pt-3 text-sm">
          <div className="flex justify-between text-ivory-muted">
            <span>Сумма</span><span>{byn(total)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-gold-400">
              <span>
                Скидка
                {DISCOUNT_LABEL[priced.kind] ? ` (${DISCOUNT_LABEL[priced.kind]})` : ""}
              </span>
              <span>−{byn(discount)}</span>
            </div>
          )}
          {priced.freeUnits > 0 && (
            <div className="flex justify-between text-botanical-300">
              <span>Бесплатно по акции</span>
              <span>
                {priced.freeUnits} шт.
                {superPromo ? ` · ${superPromo.name}` : ""}
              </span>
            </div>
          )}
          {effSpend > 0 && (
            <div className="flex justify-between text-botanical-300">
              <span>Баллы</span><span>−{byn(effSpend)}</span>
            </div>
          )}
          {certUse && certUse.applied > 0 && (
            <div className="flex justify-between text-botanical-300">
              <span>Сертификат</span><span>−{byn(certUse.applied)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-medium text-ivory">
            <span>К оплате</span><span className="text-gold-gradient">{byn(toPay)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          onClick={closeSale}
          disabled={pending || cart.length === 0}
          className="h-12 w-full rounded-full bg-gold-gradient text-base font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Закрываем…" : "Закрыть продажу"}
        </button>
      </div>
    </div>
  );
}
