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
import { saveCheckout, placeOrder, type CheckoutForm } from "../lib/checkout-client";

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
  const [mounted, setMounted] = useState(false);

  // форма
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState<"pickup" | "post">("pickup");
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
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToSpend, setPointsToSpend] = useState(0);

  /** Аккаунт покупателя, если он вошёл в кабинет. */
  const [account, setAccount] = useState<Account | null>(null);
  /** Суммы со скидками — считает сервер, здесь мы их только показываем. */
  const [quote, setQuote] = useState<Quote | null>(null);
  /** Есть ли что предложить добрать: от этого зависит, куда ведёт кнопка. */
  const [hasOffer, setHasOffer] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrderId, setDoneOrderId] = useState<number | null>(null);

  useEffect(() => {
    setCart(readCart());
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
        if (data.session?.authenticated) {
          setAccount(data.session);
          setBalance(data.session.balance || 0);
          setCustomerName(data.session.name);
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
  }, [cart, mounted]);

  // Суммы: пока сервер не ответил, показываем цены из корзины.
  const gross = quote?.gross ?? cart.reduce((s, i) => s + i.priceByn * i.qty, 0);
  const total = quote?.net ?? gross;
  const discount = quote?.discount ?? 0;

  // Поиск клиента по телефону (баланс баллов)
  useEffect(() => {
    // Для вошедшего в кабинет искать нечего: и баланс, и карта уже пришли
    // вместе с сессией, а номер он поменять не может.
    if (account) return;
    // Ищем, только когда номер дописан целиком: иначе на каждой цифре улетал
    // бы запрос с заведомо неполным номером.
    if (!isValidLocalDigits(phone)) {
      setBalance(0);
      setCustomerName(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/customer?phone=${encodeURIComponent(BELARUS_PREFIX + phone)}`,
        );
        const data = await r.json();
        setBalance(data.balance || 0);
        setCustomerName(data.found ? data.name : null);
        if (data.found && data.name && !name) setName(data.name);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [phone, account]);

  const maxSpend = Math.min(balance, total);
  const effectiveSpend = usePoints ? Math.min(pointsToSpend || maxSpend, maxSpend) : 0;
  const toPay = Math.max(0, Math.round((total - effectiveSpend) * 100) / 100);

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
    if (delivery === "post") {
      const bad = validateDelivery(deliveryData);
      if (bad) {
        setError(bad);
        return;
      }
    }

    const form: CheckoutForm = {
      name,
      phone,
      deliveryType: delivery,
      delivery: deliveryData,
      comment,
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
  if (cart.length === 0) {
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
              {customerName ? (
                <p className="mt-1.5 text-xs text-botanical-300">
                  С возвращением, {customerName}! Баланс баллов: {formatByn(balance)}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-ivory-faint">
                  Есть VIP-карта?{" "}
                  <a href="/login" className="text-gold-400 hover:text-gold-300">
                    Войдите в кабинет
                  </a>{" "}
                  — скидка применится к заказу.
                </p>
              )}
            </div>
          </>
        )}

        {/* Способ получения */}
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-luxe text-gold-500">
            Способ получения
          </span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "pickup", l: "Самовывоз" },
              { v: "post", l: "Почтой" },
            ] as const).map((o) => (
              <button
                key={o.v} type="button"
                onClick={() => setDelivery(o.v)}
                className={`h-11 cursor-pointer rounded-lg border text-sm transition-colors ${
                  delivery === o.v
                    ? "border-gold-500 bg-gold-500/10 text-gold-300"
                    : "border-ink-600 text-ivory-muted hover:border-gold-600/60"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {delivery === "post" && (
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

        {/* Баллы */}
        {balance > 0 && (
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
