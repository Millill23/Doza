import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
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
];

export const GET: APIRoute = async () => {
  const products = await prisma.product.findMany({
    where: { isArchived: false },
    select: { slug: true, updatedAt: true },
    orderBy: { id: "asc" },
  });

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC.map((p) => ({
      loc: SITE_URL + p,
      lastmod: today,
      priority: p === "/" ? "1.0" : "0.7",
    })),
    ...products.map((p) => ({
      loc: `${SITE_URL}/product/${p.slug}`,
      lastmod: p.updatedAt.toISOString().slice(0, 10),
      priority: "0.8",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`,
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
