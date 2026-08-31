import { useEffect, useState } from "react";
import PhoneInput from "./PhoneInput";
import {
  BELARUS_PREFIX,
  isValidLocalDigits,
  toLocalDigits,
  PHONE_ERROR,
} from "@doza/shared/phone";

/** Покупатель, вошедший в кабинет: скидка по карте положена только ему. */
interface Account {
  authenticated: true;
  name: string;
  phone: string;
  vipCard: string | null;
  vipPercent: number;
  balance: number;
}

/** Итоги корзины, посчитанные сервером. */
interface Quote {
  gross: number;
  net: number;
  discount: number;
  kind: "none" | "vip" | "social" | "date" | "promo" | "super";
}
import { BELARUS_REGIONS, validateDelivery } from "@doza/shared/delivery";
import {
  DELIVERY_CHOICES,
  DELIVERY_TYPE_LABEL,
  needsPostalAddress,
  needsOffice,
  type DeliveryTypeValue,
} from "@doza/db/delivery-rules";
import { saveCheckout, placeOrder, type CheckoutForm } from "../lib/checkout-client";
import {
  readGiftCart,
  removeGift,
  clearGiftCart,
  type GiftCartItem,
} from "../lib/gift-cart";
import { BELARUS_PREFIX as PREFIX } from "@doza/shared/phone";
import OfficePicker, { type Office } from "./OfficePicker";

/** Стоимость доставки — считает сервер, здесь только показываем. */
interface DeliveryInfo {
  fee: number;
  missingForFree: number;
  free: boolean;
  hint: string | null;
  /** Есть ли что везти. false — в заказе только электронные сертификаты. */
  needed?: boolean;
}

/** Общий вид поля ввода — их в форме доставки восемь. */
const FIELD =
  "h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";

interface CartItem {
  productId: number;
  name: string;
  brand: string;
  image: string;
  volumeMl: number;
  priceByn: number;
  qty: number;
}

function formatByn(n: number): string {
  return `${n.toFixed(2)} BYN`;
}

/** +375 (29) 123-45-67 из хранимых двенадцати цифр. */
function formatPhone(stored: string): string {
  const d = stored.replace(/\D/g, "").slice(-9);
  return `+375 (${d.slice(0, 2)}) ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7)}`;
}

function readCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem("doza_cart") || "[]");
  } catch {
    return [];
  }
}

function writeCart(cart: CartItem[]) {
  localStorage.setItem("doza_cart", JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("doza:cart-updated"));
}

export default function CartApp() {
  const [cart, setCart] = useState<CartItem[]>([]);
  /** Сертификаты — отдельным списком: у них нет ни объёма, ни остатка. */
  const [gifts, setGifts] = useState<GiftCartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // форма
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState<DeliveryTypeValue>("pickup");
  const [comment, setComment] = useState("");

  // Данные посылки — только для доставки почтой.
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);

  // лояльность
  const [balance, setBalance] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToSpend, setPointsToSpend] = useState(0);

  /** Аккаунт покупателя, если он вошёл в кабинет. */
  const [account, setAccount] = useState<Account | null>(null);
  /** Промокод: то, что набрал покупатель, и вердикт сервера по нему. */
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<{ code: string; percent: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  /**
   * Код для пересчёта — с задержкой. Иначе запрос улетал бы на каждую букву, и
   * покупатель видел бы «такого промокода нет», ещё не дописав свой.
   */
  const [promoCodeDebounced, setPromoCodeDebounced] = useState("");
  /** Суммы со скидками — считает сервер, здесь мы их только показываем. */
  const [quote, setQuote] = useState<Quote | null>(null);
  /** Есть ли что предложить добрать: от этого зависит, куда ведёт кнопка. */
  const [hasOffer, setHasOffer] = useState(false);
  /** Стоимость доставки и подсказка про порог — считает сервер. */
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);

  // Получатель для Европочты: посылку выдают по ФИО и телефону в отделении.
  const [epLastName, setEpLastName] = useState("");
  const [epFirstName, setEpFirstName] = useState("");
  const [epMiddleName, setEpMiddleName] = useState("");
  const [epPhone, setEpPhone] = useState("");
  const [office, setOffice] = useState<Office | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrderId, setDoneOrderId] = useState<number | null>(null);

  useEffect(() => {
    setCart(readCart());
    setGifts(readGiftCart());
    setMounted(true);
  }, []);

  // Пересчёт корзины на сервере при каждом изменении состава.
  //
  // Считать здесь нельзя: цены лежат в localStorage с того момента, когда товар
  // положили в корзину, а VIP-скидка вообще не то, что стоит доверять браузеру.
  // Тот же расчёт применяется при оформлении, поэтому показанное совпадает со
  // списанным.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deliveryType: delivery,
            promoCode,
            certificates: gifts.map((g) => ({
              denomination: g.denomination,
              sendBySms: g.sendBySms,
            })),
            items: cart.map((i) => ({
              productId: i.productId,
              volumeMl: i.volumeMl,
              qty: i.qty,
            })),
          }),
        });
        const data = await r.json();
        if (cancelled) return;
        setQuote(data.cart ?? null);
        setHasOffer((data.upsellCount ?? 0) > 0);
        setDeliveryInfo(data.delivery ?? null);
        setPromo(data.promo ?? null);
        setPromoError(data.promoError ?? null);
        if (data.session?.authenticated) {
          setAccount(data.session);
          setBalance(data.session.balance || 0);
          setName(data.session.name);
          setPhone(toLocalDigits(data.session.phone));
        }
      } catch {
        /* показываем цены из корзины — заказ всё равно пересчитает сервер */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, gifts, mounted, delivery, promoCodeDebounced]);

  useEffect(() => {
    const t = setTimeout(() => setPromoCodeDebounced(promoCode.trim()), 500);
    return () => clearTimeout(t);
  }, [promoCode]);

  // Суммы: пока сервер не ответил, показываем цены из корзины.
  const gross = quote?.gross ?? cart.reduce((s, i) => s + i.priceByn * i.qty, 0);
  const total = quote?.net ?? gross;
  const discount = quote?.discount ?? 0;


  // Везти нечего — только электронные сертификаты. Сервер считает так же.
  const shipping = deliveryInfo?.needed ?? true;
  const deliveryFee = deliveryInfo?.fee ?? 0;
  // Баллами платят за товар, но не за доставку: иначе бесплатная доставка
  // получалась бы за чужой счёт.
  const maxSpend = Math.min(balance, total);
  const effectiveSpend = usePoints ? Math.min(pointsToSpend || maxSpend, maxSpend) : 0;
  const toPay = Math.max(0, Math.round((total + deliveryFee - effectiveSpend) * 100) / 100);

  function setQty(idx: number, qty: number) {
    const next = cart.slice();
    next[idx] = { ...next[idx], qty: Math.max(1, qty) };
    setCart(next);
    writeCart(next);
  }

  function removeItem(idx: number) {
    const next = cart.filter((_, i) => i !== idx);
    setCart(next);
    writeCart(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // У вошедшего в кабинет номер берётся из аккаунта — проверять поле не нужно.
    if (!account && !isValidLocalDigits(phone)) {
      setError(PHONE_ERROR);
      return;
    }
    const deliveryData = {
      lastName, firstName, middleName, postalCode, region, city, address,
    };
    if (shipping && needsPostalAddress(delivery)) {
      const bad = validateDelivery(deliveryData);
      if (bad) {
        setError(bad);
        return;
      }
    }

    // Европочта: посылку выдают по паспорту и извещению, поэтому ФИО,
    // телефон получателя и отделение обязательны.
    if (shipping && needsOffice(delivery)) {
      if (!epLastName.trim() || !epFirstName.trim() || !epMiddleName.trim()) {
        setError("Укажите фамилию, имя и отчество получателя");
        return;
      }
      if (!isValidLocalDigits(epPhone)) {
        setError("Проверьте телефон получателя: " + PHONE_ERROR.toLowerCase());
        return;
      }
      if (!office) {
        setError("Выберите отделение Европочты");
        return;
      }
    }

    const form: CheckoutForm = {
      name,
      phone,
      deliveryType: delivery,
      delivery: deliveryData,
      europost: office
        ? {
            lastName: epLastName.trim(),
            firstName: epFirstName.trim(),
            middleName: epMiddleName.trim(),
            phone: BELARUS_PREFIX + epPhone,
            officeCode: office.code,
          }
        : undefined,
      comment,
      promoCode,
      certificates: gifts.map((g) => ({
        denomination: g.denomination,
        sendBySms: g.sendBySms,
        recipientPhone: g.recipientPhone ? PREFIX + g.recipientPhone : undefined,
        recipientName: g.recipientName,
        message: g.message,
      })),
      loyaltySpend: effectiveSpend,
    };

    // Есть что предложить — сначала показываем предложение. Форма уже
    // проверена, поэтому дальше покупателю останется только нажать «оплатить».
    if (hasOffer) {
      saveCheckout(form);
      window.location.href = "/cart/offer";
      return;
    }

    setSubmitting(true);
    const res = await placeOrder(form, cart);
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Корзину чистим только при переходе к оплате: если платёж не состоится,
    // покупатель вернётся на /payment/fail и захочет попробовать снова.
    writeCart([]);
    setCart([]);
    clearGiftCart();
    setGifts([]);
    if ("redirectUrl" in res) {
      window.location.href = res.redirectUrl;
      return;
    }
    // Заказ полностью покрыт баллами — платить нечего.
    setDoneOrderId(res.orderId);
  }

  if (!mounted) return null;

  // Экран успеха
  if (doneOrderId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-gold-500/40 bg-ink-700 p-10 text-center shadow-gold">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gold-gradient">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0E0D0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="mb-3 font-serif text-3xl text-gold-gradient">Заказ принят!</h2>
        <p className="mb-2 text-ivory-muted">
          Номер вашего заказа: <span className="text-gold-400">#{doneOrderId}</span>
        </p>
        <p className="mb-6 text-sm font-light text-ivory-muted">
          Заказ полностью оплачен баллами. Мы свяжемся с вами по телефону для
          подтверждения.
        </p>
        <a
          href="/catalog"
          className="inline-flex h-11 items-center justify-center rounded-full border border-gold-500/70 px-6 text-sm text-gold-400 transition-colors hover:bg-gold-500/10"
        >
          Продолжить покупки
        </a>
      </div>
    );
  }

  // Пустая корзина
  if (cart.length === 0 && gifts.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-ink-600/60 bg-ink-700 p-10 text-center">
        <p className="mb-6 text-ivory-muted">Ваша корзина пуста.</p>
        <a
          href="/catalog"
          className="inline-flex h-11 items-center justify-center rounded-full bg-gold-gradient px-6 text-sm font-medium text-ink-900 shadow-gold transition-all hover:shadow-gold-lg"
        >
          Перейти в каталог
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      {/* Список позиций */}
      <div className="space-y-4">
        {gifts.map((g, idx) => (
          <div
            key={"gift-" + idx}
            className="flex gap-4 rounded-xl border border-gold-600/40 bg-gold-500/5 p-4"
          >
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-gold-600/40 bg-ink-800">
              <span className="font-serif text-lg text-gold-gradient">
                {g.denomination}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ivory">
                Подарочный сертификат {g.denomination} BYN
              </p>
              <p className="mt-0.5 text-xs text-ivory-faint">
                {g.sendBySms
                  ? "Электронный — ссылка уйдёт в SMS" +
                    (g.recipientName ? " для " + g.recipientName : "")
                  : "Бумажная карточка — отправим почтой"}
              </p>
              <button
                type="button"
                onClick={() => {
                  removeGift(idx);
                  setGifts(readGiftCart());
                }}
                className="mt-2 cursor-pointer text-xs text-ivory-faint hover:text-gold-400"
              >
                Убрать
              </button>
            </div>
          </div>
        ))}

        {cart.map((item, idx) => (
          <div
            key={`${item.productId}-${item.volumeMl}`}
            className="flex gap-4 rounded-xl border border-ink-600/60 bg-ink-700 p-4"
          >
            <img
              src={item.image}
              alt={item.name}
              className="h-24 w-20 rounded-lg object-cover"
            />
            <div className="flex flex-1 flex-col">
              <div className="text-[11px] font-medium uppercase tracking-luxe text-gold-500">
                {item.brand}
              </div>
              <h3 className="font-serif text-lg text-ivory">{item.name}</h3>
              <span className="text-sm text-ivory-muted">{item.volumeMl} мл</span>
              <div className="mt-auto flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(idx, item.qty - 1)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-ink-600 text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-400"
                    aria-label="Уменьшить"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-ivory">{item.qty}</span>
                  <button
                    onClick={() => setQty(idx, item.qty + 1)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-ink-600 text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-400"
                    aria-label="Увеличить"
                  >
                    +
                  </button>
                </div>
                <span className="font-medium text-gold-400">
                  {formatByn(item.priceByn * item.qty)}
                </span>
              </div>
            </div>
            <button
              onClick={() => removeItem(idx)}
              className="cursor-pointer self-start text-ivory-faint transition-colors hover:text-gold-400"
              aria-label="Удалить"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Оформление */}
      <form
        onSubmit={submit}
        className="space-y-5 rounded-2xl border border-ink-600/60 bg-ink-700 p-6 lg:sticky lg:top-24 lg:self-start"
      >
        <h2 className="font-serif text-2xl text-ivory">Оформление заказа</h2>

        {account ? (
          /* Вошёл в кабинет — имя и телефон берём из аккаунта. Спрашивать их
             заново незачем, а главное — скидка по карте положена именно этому
             аккаунту, а не тому номеру, который наберут в поле. */
          <div className="rounded-lg border border-ink-600/60 bg-ink-800/40 p-4">
            <p className="text-sm text-ivory">
              {account.name}
              {account.vipCard && (
                <span className="ml-2 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold text-ink-900">
                  ⭐ VIP −{account.vipPercent}%
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-ivory-faint">
              {formatPhone(account.phone)} ·{" "}
              <a href="/account" className="text-gold-400 hover:text-gold-300">
                личный кабинет
              </a>
            </p>
            {balance > 0 && (
              <p className="mt-1 text-xs text-botanical-300">
                Баланс баллов: {formatByn(balance)}
              </p>
            )}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="f-name" className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
                Имя
              </label>
              <input
                id="f-name" type="text" required value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
                placeholder="Как к вам обращаться"
              />
            </div>

            <div>
              <label htmlFor="f-phone" className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
                Телефон
              </label>
              <PhoneInput id="f-phone" value={phone} onChange={setPhone} required />
              {/*
                По набранному номеру мы больше ничего не показываем. Раньше
                здесь появлялось «С возвращением, имя! Баланс баллов…» — то
                есть имя и баланс владельца номера видел любой, кто этот номер
                набрал. И баллы с него же и списывались.
              */}
              <p className="mt-1.5 text-xs text-ivory-faint">
                Есть VIP-карта или баллы?{" "}
                <a href="/login" className="text-gold-400 hover:text-gold-300">
                  Войдите в кабинет
                </a>{" "}
                — скидка и баллы применятся к заказу.
              </p>
            </div>
          </>
        )}

        {/* Способ получения. Прячем целиком, когда везти нечего: заказ из
            одних электронных сертификатов уходит ссылкой в SMS, и спрашивать
            адрес или отделение не за что. */}
        {shipping && (
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
            Способ получения
          </span>
          <div className="grid grid-cols-3 gap-2">
            {DELIVERY_CHOICES.map((v) => (
              <button
                key={v} type="button"
                onClick={() => setDelivery(v)}
                className={`min-h-[44px] cursor-pointer rounded-lg border px-1 text-sm transition-colors ${
                  delivery === v
                    ? "border-gold-500 bg-gold-500/10 text-gold-300"
                    : "border-ink-600 text-ivory-muted hover:border-gold-600/60"
                }`}
              >
                {DELIVERY_TYPE_LABEL[v]}
              </button>
            ))}
          </div>
          {/* Подсказку показываем только когда до бесплатной реально близко —
              иначе это не помощь, а уговор купить лишнего. */}
          {deliveryInfo?.hint && (
            <p className="mt-2 rounded-lg border border-gold-600/30 bg-gold-500/5 p-2.5 text-xs leading-relaxed text-gold-400">
              {deliveryInfo.hint}
            </p>
          )}
        </div>
        )}

        {shipping && needsPostalAddress(delivery) && (
          <div className="space-y-3 rounded-lg border border-ink-600/60 bg-ink-800/40 p-4">
            <h3 className="text-xs uppercase tracking-luxe text-gold-500">
              Данные для доставки
            </h3>
            <p className="text-xs leading-relaxed text-ivory-faint">
              ФИО получателя нужно полностью — по нему посылку выдают в
              отделении.
            </p>

            <div className="grid gap-2">
              <input
                type="text" required value={lastName} autoComplete="family-name"
                onChange={(e) => setLastName(e.target.value)}
                className={FIELD} placeholder="Фамилия"
              />
              <input
                type="text" required value={firstName} autoComplete="given-name"
                onChange={(e) => setFirstName(e.target.value)}
                className={FIELD} placeholder="Имя"
              />
              <input
                type="text" required value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className={FIELD} placeholder="Отчество"
              />
            </div>

            <div className="grid grid-cols-[110px_1fr] gap-2">
              <input
                type="text" required value={postalCode} inputMode="numeric"
                maxLength={6} autoComplete="postal-code"
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))}
                className={FIELD} placeholder="Индекс"
              />
              <select
                required value={region}
                onChange={(e) => setRegion(e.target.value)}
                className={`${FIELD} ${region ? "" : "text-ivory-faint"}`}
              >
                <option value="">Область</option>
                {BELARUS_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <input
              type="text" required value={city}
              onChange={(e) => setCity(e.target.value)}
              className={FIELD} placeholder="Населённый пункт"
            />
            <input
              id="f-addr" type="text" required value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={FIELD} placeholder="Улица, дом, квартира"
            />
          </div>
        )}

        {shipping && needsOffice(delivery) && (
          <div className="space-y-3 rounded-lg border border-ink-600/60 bg-ink-800/40 p-4">
            <h3 className="text-xs uppercase tracking-luxe text-gold-500">
              Получатель и отделение
            </h3>
            <p className="text-xs leading-relaxed text-ivory-faint">
              Посылку выдают в отделении по паспорту, поэтому ФИО нужно
              полностью, а телефон — тот, на который придёт извещение.
            </p>

            <div className="grid gap-2">
              <input type="text" required value={epLastName} autoComplete="family-name"
                onChange={(e) => setEpLastName(e.target.value)}
                className={FIELD} placeholder="Фамилия" />
              <input type="text" required value={epFirstName} autoComplete="given-name"
                onChange={(e) => setEpFirstName(e.target.value)}
                className={FIELD} placeholder="Имя" />
              <input type="text" required value={epMiddleName}
                onChange={(e) => setEpMiddleName(e.target.value)}
                className={FIELD} placeholder="Отчество" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
                Телефон получателя
              </label>
              <PhoneInput value={epPhone} onChange={setEpPhone} required />
            </div>

            <OfficePicker selected={office} onSelect={setOffice} />
          </div>
        )}

        <div>
          <label htmlFor="f-comment" className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
            Комментарий
          </label>
          <textarea
            id="f-comment" rows={2} value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
            placeholder="Пожелания к заказу"
          />
        </div>

        {/* Промокод */}
        <div>
          <label htmlFor="f-promo" className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
            Промокод
          </label>
          <input
            id="f-promo"
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Если есть"
            className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm uppercase text-ivory placeholder:normal-case placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
          />
          {promo && (
            <p className="mt-1.5 text-xs text-botanical-300">
              Промокод {promo.code} применён — скидка {promo.percent}%. Если у
              вас есть скидка выгоднее, посчитаем по ней.
            </p>
          )}
          {promoError && (
            <p className="mt-1.5 text-xs text-red-300">{promoError}</p>
          )}
        </div>

        {/* Баллы — только вошедшему в кабинет: сервер спишет их лишь по сессии. */}
        {account && balance > 0 && (
          <div className="rounded-lg border border-botanical-500/40 bg-botanical-700/20 p-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ivory">
              <input
                type="checkbox" checked={usePoints}
                onChange={(e) => setUsePoints(e.target.checked)}
                className="h-4 w-4 accent-botanical-500"
              />
              Списать баллы (доступно {formatByn(maxSpend)})
            </label>
            {usePoints && (
              <input
                type="number" min={0} max={maxSpend} step="0.01"
                value={pointsToSpend || maxSpend}
                onChange={(e) => setPointsToSpend(Number(e.target.value))}
                className="mt-2 h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
              />
            )}
          </div>
        )}

        {/* Итого */}
        <div className="space-y-1.5 border-t border-ink-600/60 pt-4 text-sm">
          <div className="flex justify-between text-ivory-muted">
            <span>Сумма</span>
            <span>{formatByn(gross)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-gold-400">
              <span>
                Скидка{quote?.kind === "vip" ? " по VIP-карте" : ""}
              </span>
              <span>−{formatByn(discount)}</span>
            </div>
          )}
          {deliveryInfo && deliveryInfo.fee > 0 && (
            <div className="flex justify-between text-ivory-muted">
              <span>Доставка</span>
              <span>{formatByn(deliveryInfo.fee)}</span>
            </div>
          )}
          {deliveryInfo?.free && delivery !== "pickup" && (
            <div className="flex justify-between text-botanical-300">
              <span>Доставка</span>
              <span>бесплатно</span>
            </div>
          )}
          {effectiveSpend > 0 && (
            <div className="flex justify-between text-botanical-300">
              <span>Списано баллов</span>
              <span>−{formatByn(effectiveSpend)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-medium text-ivory">
            <span>К оплате</span>
            <span className="text-gold-gradient">{formatByn(toPay)}</span>
          </div>
        </div>

        {/*
          Акцепт оферты — это согласие с условиями сделки, им блокировать заказ
          можно. Согласие на обработку персональных данных сюда не входит: по
          99-З данные для приёма и доставки заказа обрабатываются по основанию
          «исполнение договора». Отдельное согласие нужно только для программы
          лояльности, и его мы спрашиваем ссылкой в SMS — покупку оно не держит.
        */}
        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ivory-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
          />
          <span>
            Принимаю условия{" "}
            <a href="/offer" target="_blank" className="text-gold-400 underline-offset-2 hover:underline">
              публичной оферты
            </a>{" "}
            и ознакомлен(а) с{" "}
            <a href="/privacy" target="_blank" className="text-gold-400 underline-offset-2 hover:underline">
              Политикой обработки персональных данных
            </a>
            .
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit" disabled={submitting || !consent}
          className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-gold-gradient text-base font-medium text-ink-900 shadow-gold transition-all hover:shadow-gold-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? "Переходим к оплате…"
            : hasOffer
              ? "Далее"
              : "Перейти к оплате"}
        </button>

        <p className="text-center text-xs font-light leading-relaxed text-ivory-faint">
          Оплата картой на защищённой странице банка. Реквизиты карты не
          проходят через наш сайт.
        </p>
      </form>
    </div>
  );
}
