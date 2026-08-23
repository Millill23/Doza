import type { APIRoute } from "astro";
import { prisma } from "@doza/db";

export const prerender = false;

/**
 * Отделения Европочты для выбора при оформлении.
 *
 * Отдаём из своего справочника, а не запросом к Европочте на каждый заход:
 * их API требует ключа и может лежать, а покупатель в этот момент оформляет
 * заказ. Справочник наполняется отдельно — вручную в CRM либо фоновой
 * выгрузкой, когда появится доступ.
 */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();

  const offices = await prisma.europostOffice.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { city: { contains: q, mode: "insensitive" as const } },
              { address: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ city: "asc" }, { address: "asc" }],
    take: 200,
    select: {
      code: true,
      city: true,
      address: true,
      workingHours: true,
      latitude: true,
      longitude: true,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      offices: offices.map((o) => ({
        code: o.code,
        city: o.city,
        address: o.address,
        workingHours: o.workingHours,
        lat: o.latitude != null ? Number(o.latitude) : null,
        lng: o.longitude != null ? Number(o.longitude) : null,
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
