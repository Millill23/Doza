import { useEffect, useState } from "react";
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
  /** Что уже добавили с этой страницы — чтобы показать «✓ в корзине». */
  const [added, setAdded] = useState<Record<string, boolean>>({});

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

  function add(offer: Offer, opt: Option) {
    const next = readCart();
    const i = next.findIndex(
      (l) => l.productId === offer.productId && l.volumeMl === opt.volumeMl,
    );
    if (i >= 0) {
      next[i] = { ...next[i], qty: next[i].qty + 1 };
    } else {
      next.push({
        productId: offer.productId,
        name: offer.name,
        brand: offer.brand,
        image: offer.image,
        volumeMl: opt.volumeMl,
        // Цену всё равно пересчитает сервер — здесь она только для корзины.
        priceByn: opt.discountedByn,
        qty: 1,
        fromUpsell: true,
      });
    }
    writeCart(next);
    setCart(next);
    setAdded((prev) => ({ ...prev, [`${offer.productId}:${opt.volumeMl}`]: true }));
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

          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <div
                key={o.productId}
                className="flex flex-col overflow-hidden rounded-xl border border-ink-600/60 bg-ink-700"
              >
                <a href={`/product/${o.slug}`} className="block">
                  <img
                    src={o.image}
                    alt={`${o.brand} ${o.name}`}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                </a>
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[10px] uppercase tracking-luxe text-gold-500">
                    {o.brand}
                  </span>
                  <a
                    href={`/product/${o.slug}`}
                    className="font-serif text-lg text-ivory hover:text-gold-400"
                  >
                    {o.name}
                  </a>
                  <span className="mt-0.5 text-[11px] text-ivory-faint">
                    {GENDER[o.gender] ?? ""}
                  </span>

                  <div className="mt-3 space-y-2">
                    {o.options.map((opt) => {
                      const key = `${o.productId}:${opt.volumeMl}`;
                      return (
                        <button
                          key={opt.volumeMl}
                          onClick={() => add(o, opt)}
                          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-ink-600 px-3 py-2 text-left text-sm transition-colors hover:border-gold-500"
                        >
                          <span className="text-ivory-muted">
                            {opt.volumeMl} мл
                          </span>
                          <span className="flex items-center gap-2">
                            <s className="text-xs text-ivory-faint">
                              {opt.priceByn.toFixed(2)}
                            </s>
                            <span className="font-medium text-gold-400">
                              {byn(opt.discountedByn)}
                            </span>
                            <span className="text-xs text-botanical-300">
                              {added[key] ? "✓" : "+"}
                            </span>
                          </span>
                        </button>
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
          Добавлено к заказу: {addedCount} шт. со скидкой {percent}%
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mx-auto flex max-w-md flex-col gap-3">
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
