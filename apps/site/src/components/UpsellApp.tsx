import { useEffect, useState } from "react";
import { clearGiftCart } from "../lib/gift-cart";
import {
  loadCheckout,
  clearCheckout,
  placeOrder,
  type CheckoutForm,
} from "../lib/checkout-client";

/**
 * Шаг между корзиной и оплатой: предлагаем добрать похожий аромат со скидкой.
 *
 * Ничего не навязываем: отказаться — это просто нажать «Перейти к оплате»,
 * кнопка стоит на виду и не выглядит второстепенной.
 */

interface CartItem {
  productId: number;
  name: string;
  brand: string;
  image: string;
  volumeMl: number;
  priceByn: number;
  qty: number;
  fromUpsell?: boolean;
}

interface Option {
  volumeMl: number;
  priceByn: number;
  discountedByn: number;
}

interface Offer {
  productId: number;
  slug: string;
  name: string;
  brand: string;
  image: string;
  gender: string;
  notes: string;
  options: Option[];
}

const GENDER: Record<string, string> = {
  male: "Мужской",
  female: "Женский",
  unisex: "Унисекс",
};

function byn(n: number): string {
  return `${n.toFixed(2)} BYN`;
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

export default function UpsellApp() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [form, setForm] = useState<CheckoutForm | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [percent, setPercent] = useState(20);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Итог заказа со скидками — считает сервер, показываем над кнопкой оплаты. */
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    const saved = loadCheckout();
    const items = readCart();

    // Сюда попадают только из корзины, с заполненной формой. Прямой заход или
    // потерянная сессия — возвращаем назад, а не показываем полупустой шаг.
    if (!saved || items.length === 0) {
      window.location.replace("/cart");
      return;
    }
    setForm(saved);
    setCart(items);

    (async () => {
      try {
        const r = await fetch("/api/cart/offer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              productId: i.productId,
              volumeMl: i.volumeMl,
              qty: i.qty,
              fromUpsell: i.fromUpsell === true,
            })),
          }),
        });
        const data = await r.json();
        setOffers(data.offers ?? []);
        setPercent(data.percent ?? 20);
      } catch {
        setOffers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Итог пересчитывает сервер — он же применяет скидку. Показывать сумму,
  // посчитанную здесь, значило бы обещать цену, которой можем не подтвердить.
  useEffect(() => {
    if (cart.length === 0) return;
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
              fromUpsell: i.fromUpsell === true,
            })),
          }),
        });
        const data = await r.json();
        if (!cancelled && data.cart) setTotal(data.cart.net);
      } catch {
        /* сумму просто не покажем — оплату это не блокирует */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart]);

  /** Сколько этого объёма уже в корзине. Счётчик всегда показывает правду. */
  function qtyOf(productId: number, volumeMl: number): number {
    return (
      cart.find((l) => l.productId === productId && l.volumeMl === volumeMl)?.qty ?? 0
    );
  }

  /** Задать количество. 0 — убрать позицию из корзины совсем. */
  function setQty(offer: Offer, opt: Option, qty: number) {
    const next = readCart();
    const i = next.findIndex(
      (l) => l.productId === offer.productId && l.volumeMl === opt.volumeMl,
    );

    if (qty <= 0) {
      if (i >= 0) next.splice(i, 1);
    } else if (i >= 0) {
      next[i] = { ...next[i], qty };
    } else {
      next.push({
        productId: offer.productId,
        name: offer.name,
        brand: offer.brand,
        image: offer.image,
        volumeMl: opt.volumeMl,
        // Цену всё равно пересчитает сервер — здесь она только для корзины.
        priceByn: opt.discountedByn,
        qty,
        fromUpsell: true,
      });
    }

    writeCart(next);
    setCart(next);
  }

  async function pay() {
    if (!form) return;
    setError(null);
    setPaying(true);
    const res = await placeOrder(form, readCart());
    setPaying(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    writeCart([]);
    clearCheckout();
    clearGiftCart();
    if ("redirectUrl" in res) {
      window.location.href = res.redirectUrl;
      return;
    }
    window.location.href = `/payment/success?order=${res.orderId}`;
  }

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-ivory-faint">
        Подбираем предложение…
      </p>
    );
  }

  const addedCount = cart.filter((i) => i.fromUpsell).length;

  return (
    <div className="mx-auto max-w-4xl">
      {offers.length > 0 && (
        <>
          <div className="mb-8 rounded-2xl border border-gold-500/40 bg-gold-500/5 p-5 text-center">
            <p className="font-serif text-xl text-gold-gradient">
              Добавьте к заказу со скидкой {percent}%
            </p>
            <p className="mt-1.5 text-sm font-light text-ivory-muted">
              Мы подобрали ароматы, близкие к вашему выбору. Скидка действует
              только при оформлении этого заказа — отдельно потом купить по этой
              цене не получится.
            </p>
          </div>

          <div className="mb-10 grid grid-cols-2 gap-3 sm:gap-5">
            {offers.map((o) => (
              <div
                key={o.productId}
                className="flex flex-col overflow-hidden rounded-xl border border-ink-600/60 bg-ink-700"
              >
                <a href={`/product/${o.slug}`} className="relative block">
                  <img
                    src={o.image}
                    alt={`${o.brand} — ${o.name}, парфюм на распив`}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <span className="absolute left-2 top-2 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold text-ink-900">
                    −{percent}%
                  </span>
                </a>

                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  <span className="text-[10px] uppercase tracking-luxe text-gold-500">
                    {o.brand}
                  </span>
                  <a
                    href={`/product/${o.slug}`}
                    className="font-serif text-base leading-tight text-ivory transition-colors hover:text-gold-400 sm:text-lg"
                  >
                    {o.name}
                  </a>
                  <span className="mt-0.5 text-[11px] text-ivory-faint">
                    {GENDER[o.gender] ?? ""}
                  </span>

                  <div className="mt-3 space-y-3">
                    {o.options.map((opt) => {
                      const qty = qtyOf(o.productId, opt.volumeMl);
                      const label = `${o.brand} ${o.name}, ${opt.volumeMl} мл`;
                      return (
                        <div key={opt.volumeMl}>
                          {/* Валюту в строке объёма не повторяем: карточка
                              узкая, а «BYN» стоит внизу у итоговой суммы. */}
                          <div className="mb-1.5 flex items-baseline justify-between gap-1 whitespace-nowrap">
                            <span className="text-sm text-ivory-muted">
                              {opt.volumeMl} мл
                            </span>
                            <span className="flex items-baseline gap-1.5">
                              <s className="text-[11px] text-ivory-faint">
                                {opt.priceByn.toFixed(2)}
                              </s>
                              <span className="text-sm font-medium text-gold-400">
                                {opt.discountedByn.toFixed(2)}
                              </span>
                            </span>
                          </div>

                          {qty === 0 ? (
                            <button
                              onClick={() => setQty(o, opt, 1)}
                              className="flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-lg border border-gold-600/50 px-2 text-sm text-gold-400 transition-colors hover:bg-gold-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
                              aria-label={`Добавить в корзину ${label}`}
                            >
                              В корзину
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setQty(o, opt, qty - 1)}
                                className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border border-ink-600 text-lg text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
                                aria-label={
                                  qty === 1
                                    ? `Убрать из корзины ${label}`
                                    : `Уменьшить количество: ${label}`
                                }
                              >
                                −
                              </button>
                              <span
                                className="min-w-[2rem] shrink-0 text-center text-sm font-medium tabular-nums text-ivory"
                                aria-live="polite"
                              >
                                {qty}
                              </span>
                              <button
                                onClick={() => setQty(o, opt, qty + 1)}
                                className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border border-ink-600 text-lg text-ivory-muted transition-colors hover:border-gold-500 hover:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
                                aria-label={`Увеличить количество: ${label}`}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {addedCount > 0 && (
        <p className="mb-4 text-center text-sm text-botanical-300">
          Добавлено к заказу: {addedCount} поз. со скидкой {percent}%
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mx-auto flex max-w-md flex-col gap-3">
        {total !== null && (
          <div className="flex items-baseline justify-between border-t border-ink-600/60 pt-4 text-base">
            <span className="font-medium text-ivory">К оплате</span>
            <span className="text-lg font-medium text-gold-gradient">
              {byn(total)}
            </span>
          </div>
        )}
        <button
          onClick={pay}
          disabled={paying}
          className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-gold-gradient text-base font-medium text-ink-900 shadow-gold transition-all hover:shadow-gold-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {paying ? "Переходим к оплате…" : "Перейти к оплате"}
        </button>
        <a
          href="/cart"
          className="text-center text-xs text-ivory-faint hover:text-gold-400"
        >
          ← Вернуться в корзину
        </a>
      </div>
    </div>
  );
}
