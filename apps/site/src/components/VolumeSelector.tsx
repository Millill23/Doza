import { useState } from "react";
import type { ProductVolume } from "../lib/types";

interface Props {
  productId: number;
  productName: string;
  brand: string;
  image: string;
  volumes: ProductVolume[];
  discountPercent?: number;
}

function formatByn(amount: number): string {
  return `${amount.toFixed(2)} BYN`;
}

interface CartItem {
  productId: number;
  name: string;
  brand: string;
  image: string;
  volumeMl: number;
  priceByn: number;
  qty: number;
}

function addToCart(item: CartItem) {
  const raw = localStorage.getItem("doza_cart");
  const cart: CartItem[] = raw ? JSON.parse(raw) : [];
  const existing = cart.find(
    (c) => c.productId === item.productId && c.volumeMl === item.volumeMl,
  );
  if (existing) existing.qty += item.qty;
  else cart.push(item);
  localStorage.setItem("doza_cart", JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("doza:cart-updated"));
}

export default function VolumeSelector({
  productId,
  productName,
  brand,
  image,
  volumes,
  discountPercent = 0,
}: Props) {
  const active = volumes.filter((v) => v.priceByn > 0);
  const [selected, setSelected] = useState<number>(active[0]?.volumeMl ?? 0);
  const [added, setAdded] = useState(false);

  const d = discountPercent > 0 ? discountPercent : 0;
  const finalPrice = (p: number) => Math.round(p * (1 - d / 100) * 100) / 100;

  const current = active.find((v) => v.volumeMl === selected) ?? active[0];

  function handleAdd() {
    if (!current) return;
    addToCart({
      productId,
      name: productName,
      brand,
      image,
      volumeMl: current.volumeMl,
      priceByn: finalPrice(current.priceByn),
      qty: 1,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-luxe text-gold-500">
          Объём
        </h3>
        <div className="flex flex-wrap gap-3">
          {active.map((v) => (
            <button
              key={v.volumeMl}
              onClick={() => setSelected(v.volumeMl)}
              className={`flex min-w-[88px] cursor-pointer flex-col items-center rounded-xl border px-4 py-3 transition-all duration-200 ${
                selected === v.volumeMl
                  ? "border-gold-500 bg-gold-500/10 shadow-gold"
                  : "border-ink-600 hover:border-gold-600/60"
              }`}
            >
              <span className="font-serif text-lg text-ivory">
                {v.volumeMl} мл
              </span>
              <span
                className={`text-sm ${
                  selected === v.volumeMl ? "text-gold-300" : "text-ivory-muted"
                }`}
              >
                {d > 0 ? (
                  <>
                    <span className="mr-1 text-ivory-faint line-through">
                      {v.priceByn.toFixed(2)}
                    </span>
                    {formatByn(finalPrice(v.priceByn))}
                  </>
                ) : (
                  formatByn(v.priceByn)
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-ink-600/60 pt-6">
        <div>
          <span className="block text-xs font-light uppercase tracking-wide text-ivory-faint">
            Цена{d > 0 && <span className="ml-2 text-botanical-300">−{d}%</span>}
          </span>
          {current ? (
            d > 0 ? (
              <span className="flex items-baseline gap-2">
                <span className="font-serif text-3xl text-gold-gradient">
                  {formatByn(finalPrice(current.priceByn))}
                </span>
                <span className="text-lg text-ivory-faint line-through">
                  {current.priceByn.toFixed(2)}
                </span>
              </span>
            ) : (
              <span className="font-serif text-3xl text-gold-gradient">
                {formatByn(current.priceByn)}
              </span>
            )
          ) : (
            <span className="font-serif text-3xl text-gold-gradient">—</span>
          )}
        </div>

        <button
          onClick={handleAdd}
          className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-gold-gradient px-8 text-base font-medium text-ink-900 shadow-gold transition-all duration-300 hover:shadow-gold-lg"
        >
          {added ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Добавлено
            </>
          ) : (
            "В корзину"
          )}
        </button>
      </div>

      <p className="text-center text-xs font-light text-ivory-faint">
        Оплата картой онлайн на защищённой странице банка.
      </p>
    </div>
  );
}
