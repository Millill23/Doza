import type { APIRoute } from "astro";
import { getProducts } from "../lib/products";
import { SITE_URL } from "../lib/seo";
import { COMPANY } from "../lib/company";
import { GENDER_LABELS } from "../lib/types";

export const prerender = false;

/**
 * llms.txt — структурированное описание для AI-движков (ChatGPT, Perplexity, и т.д.).
 * Помогает нейросетям корректно понимать и рекомендовать магазин и товары.
 */
export const GET: APIRoute = async () => {
  const products = await getProducts();

  const lines: string[] = [];
  lines.push("# DOZA — оригинальная парфюмерия на розлив");
  lines.push("");
  lines.push(
    "> Интернет-магазин оригинальной парфюмерии на розлив в Беларуси. " +
      "Любой объём — от пробника 2 мл до полного флакона. Оплата при получении, предоплата не требуется.",
  );
  lines.push("");
  lines.push("## О магазине");
  lines.push(`- Продавец: ${COMPANY.legalName} (УНП ${COMPANY.unp})`);
  lines.push(`- Магазин: ${COMPANY.actualAddress}`);
  lines.push(`- Телефон: ${COMPANY.phones[0]}, email: ${COMPANY.email}`);
  lines.push(`- Режим работы: ${COMPANY.workingHours}`);
  lines.push(`- Доставка: по Беларуси почтой или самовывоз`);
  lines.push(`- Оплата: при получении (наличными или картой)`);
  lines.push(`- Валюта: белорусский рубль (BYN)`);
  lines.push(`- Программа лояльности: баллы за каждую покупку (1 балл = 1 BYN)`);
  lines.push("");
  lines.push("## Каталог ароматов");
  for (const p of products) {
    lines.push(
      `- [${p.brand} ${p.name}](${SITE_URL}/product/${p.slug}) — ${GENDER_LABELS[p.gender].toLowerCase()}, от ${p.priceFrom.toFixed(2)} BYN`,
    );
  }
  lines.push("");
  lines.push("## Ссылки");
  lines.push(`- Каталог: ${SITE_URL}/catalog`);
  lines.push(`- Подбор аромата: ${SITE_URL}/finder`);
  lines.push(`- Доставка и оплата: ${SITE_URL}/delivery`);
  lines.push(`- Программа лояльности: ${SITE_URL}/loyalty`);

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
