import { prisma } from "@doza/db";
import { handler, ok, fail, body, type HandlerCtx } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Отделения Европочты.
 *
 * Правится главным образом координатами: часть отделений геокодер не нашёл, и
 * на карте у покупателя они отсутствуют. Проставить точку руками – ровно та
 * задача, ради которой ручка и нужна.
 */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const noCoords = url.searchParams.get("noCoords") === "1";

  const offices = await prisma.europostOffice.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { code: { contains: q } },
              { city: { contains: q, mode: "insensitive" } },
              { address: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(noCoords ? { OR: [{ latitude: null }, { longitude: null }] } : {}),
    },
    orderBy: { code: "asc" },
    take: 500,
  });

  return ok({
    count: offices.length,
    offices: offices.map((o) => ({
      id: o.id,
      code: o.code,
      city: o.city,
      address: o.address,
      workingHours: o.workingHours,
      lat: o.latitude == null ? null : Number(o.latitude),
      lng: o.longitude == null ? null : Number(o.longitude),
      isActive: o.isActive,
    })),
  });
});

export const PATCH = handler(async (request: Request, ctx: HandlerCtx) => {
  const input = await body<{
    code?: string;
    lat?: number | null;
    lng?: number | null;
    isActive?: boolean;
  }>(request);
  if (!input.code) return fail("Укажите code отделения");

  const office = await prisma.europostOffice.findUnique({ where: { code: input.code } });
  if (!office) return fail("Отделение не найдено", 404);

  // Беларусь целиком укладывается в эти рамки. Точка за ними – опечатка в
  // знаке или перепутанные местами широта с долготой, и на карте покупатель
  // увидит отделение посреди океана.
  if (input.lat != null && (input.lat < 51 || input.lat > 57)) {
    return fail("Широта вне Беларуси – проверьте, не перепутаны ли lat и lng");
  }
  if (input.lng != null && (input.lng < 23 || input.lng > 33)) {
    return fail("Долгота вне Беларуси – проверьте, не перепутаны ли lat и lng");
  }

  const updated = await prisma.europostOffice.update({
    where: { code: input.code },
    data: {
      ...(input.lat !== undefined ? { latitude: input.lat } : {}),
      ...(input.lng !== undefined ? { longitude: input.lng } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  ctx.audit(`отделение ${input.code}: ${input.lat ?? "–"}, ${input.lng ?? "–"}`);
  return ok({
    office: {
      code: updated.code,
      lat: updated.latitude == null ? null : Number(updated.latitude),
      lng: updated.longitude == null ? null : Number(updated.longitude),
      isActive: updated.isActive,
    },
  });
});
