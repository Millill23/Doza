import type { ProductDetail, ProductCard } from "./types";
import { GENDER_LABELS } from "./types";
import { COMPANY } from "./company";

export const SITE_URL = "https://doza-parfum.by";
export const SITE_NAME = "DOZA — парфюмерия на распив";

/**
 * Коды подтверждения прав в вебмастерах (вставьте после регистрации домена).
 * Яндекс.Вебмастер → «Метатег»; Google Search Console → «HTML-тег».
 */
export const SEARCH_VERIFICATION = {
  yandex: "", // содержимое content="..." из meta name="yandex-verification"
  google: "", // содержимое content="..." из meta name="google-site-verification"
};

/** JSON-LD со списком товаров для страницы каталога. */
export function catalogItemListLd(
  products: { slug: string; brand: string; name: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.slice(0, 50).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/product/${p.slug}`,
      name: `${p.brand} ${p.name}`,
    })),
  };
}

function byn(n: number): string {
  return `${n.toFixed(2)} BYN`;
}

export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  jsonLd?: object[];
}

// ── Товар ─────────────────────────────────────────────────────────────────────

/** FAQ, автоматически собранный из полей товара (для страницы + FAQPage schema). */
export function productFaq(p: ProductDetail): { q: string; a: string }[] {
  const faq: { q: string; a: string }[] = [];
  const title = `${p.brand} ${p.name}`;
  const volumes = p.volumes.map((v) => `${v.volumeMl} мл`).join(", ");

  faq.push({
    q: `Сколько стоит ${title}?`,
    a: `Цена ${title} — от ${byn(p.priceFrom)}. Доступные объёмы: ${volumes}. Оплата при получении, предоплата не требуется.`,
  });

  const notes = [p.notesTop, p.notesMid, p.notesBase].filter(Boolean);
  if (notes.length) {
    const parts: string[] = [];
    if (p.notesTop) parts.push(`верхние — ${p.notesTop}`);
    if (p.notesMid) parts.push(`средние — ${p.notesMid}`);
    if (p.notesBase) parts.push(`базовые — ${p.notesBase}`);
    faq.push({
      q: `Какие ноты у аромата ${p.name}?`,
      a: `Пирамида аромата ${title}: ${parts.join("; ")}.`,
    });
  }

  faq.push({
    q: `Это оригинальный парфюм?`,
    a: `Да. Мы разливаем только оригинальную парфюмерию во флаконы нужного объёма. ${title} — ${GENDER_LABELS[p.gender].toLowerCase()} аромат.`,
  });

  faq.push({
    q: `Как купить ${p.name} на распив?`,
    a: `Выберите нужный объём (3, 5 или 10 мл), добавьте в корзину и оформите заказ. Доставка по Беларуси почтой или самовывоз, оплата при получении.`,
  });

  return faq;
}

/** SEO-текст описания (если у товара нет своего описания — генерируем из полей). */
export function productSeoText(p: ProductDetail): string {
  if (p.description && p.description.length > 40) return p.description;
  const notes = [p.notesTop, p.notesMid, p.notesBase].filter(Boolean).join(", ");
  const g = GENDER_LABELS[p.gender].toLowerCase();
  return `${p.brand} ${p.name} — ${g} аромат${notes ? ` с нотами: ${notes}` : ""}. Оригинальная парфюмерия на распив от ${byn(p.priceFrom)} — объёмы 3, 5 и 10 мл.`;
}

export function productMeta(p: ProductDetail): SeoMeta {
  const title = `${p.brand} ${p.name} — парфюм на распив от ${byn(p.priceFrom)} | DOZA`;
  const g = GENDER_LABELS[p.gender].toLowerCase();
  const notes = [p.notesTop, p.notesMid].filter(Boolean).join(", ");
  const description = `Купить ${p.brand} ${p.name} (${g}) на распив от ${byn(
    p.priceFrom,
  )}. ${notes ? `Ноты: ${notes}. ` : ""}Оригинал, объёмы 3, 5 и 10 мл. Оплата при получении, доставка по Беларуси.`;
  const url = `${SITE_URL}/product/${p.slug}`;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${p.brand} ${p.name}`,
    brand: { "@type": "Brand", name: p.brand },
    category: "Парфюмерия",
    description: productSeoText(p),
    image: p.image,
    audience: { "@type": "PeopleAudience", suggestedGender: p.gender },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BYN",
      price: p.priceFrom.toFixed(2),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: COMPANY.legalName },
    },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: productFaq(p).map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Каталог", item: `${SITE_URL}/catalog` },
      { "@type": "ListItem", position: 2, name: `${p.brand} ${p.name}`, item: url },
    ],
  };

  return {
    title,
    description,
    canonical: url,
    ogImage: p.image,
    jsonLd: [productLd, faqLd, breadcrumbLd],
  };
}

// ── Организация (для главной / общий) ───────────────────────────────────────────

export function organizationLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: SITE_NAME,
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    telephone: COMPANY.phones[0],
    email: COMPANY.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.actualAddress,
      addressCountry: "BY",
    },
    priceRange: "BYN",
  };
}
