import type { APIRoute } from "astro";
import { getProducts } from "../lib/products";
import { SITE_URL } from "../lib/seo";

export const prerender = false;

const STATIC = [
  "/",
  "/catalog",
  "/finder",
  "/about",
  "/delivery",
  "/loyalty",
  "/legal",
  "/privacy",
  "/offer",
  "/returns",
];

export const GET: APIRoute = async () => {
  const products = await getProducts();
  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    ...STATIC.map((p) => ({
      loc: SITE_URL + p,
      priority: p === "/" ? "1.0" : "0.7",
    })),
    ...products.map((p) => ({
      loc: `${SITE_URL}/product/${p.slug}`,
      priority: "0.8",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
