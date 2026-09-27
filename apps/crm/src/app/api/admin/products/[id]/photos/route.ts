import { prisma } from "@doza/db";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getUploadsDir, UPLOADS_URL_PREFIX } from "@doza/shared/uploads";
import { revalidatePath } from "next/cache";
import { handler, ok, fail, intParam, type HandlerCtx } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/** Карточка товара 3:4 – под неё и приводим, как это делает загрузка в CRM. */
async function toWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(1000, 1333, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

async function save(webp: Buffer): Promise<string> {
  const name = `${Date.now()}-${randomBytes(4).toString("hex")}.webp`;
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), webp);
  return `${UPLOADS_URL_PREFIX}/${name}`;
}

export const GET = handler(async (_request: Request, ctx: HandlerCtx) => {
  const productId = intParam(ctx, "id");
  const photos = await prisma.productPhoto.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });
  return ok({ photos });
});

/**
 * Добавить фото: файлом или ссылкой.
 *
 * Ссылка удобнее всего: картинку не надо тащить через переписку, сервер сам
 * скачает и сожмёт. Скачиваем только по http(s) и только изображения – иначе
 * ручка превращается в способ заставить наш сервер ходить куда попросят.
 */
export const POST = handler(async (request: Request, ctx: HandlerCtx) => {
  const productId = intParam(ctx, "id");
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return fail("Товар не найден", 404);

  const type = request.headers.get("content-type") ?? "";
  let input: Buffer;
  let source: string;

  if (type.includes("application/json")) {
    const { url } = (await request.json().catch(() => ({}))) as { url?: string };
    if (!url) return fail("Укажите url картинки или пришлите файл");

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return fail("Некорректный адрес картинки");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fail("Только http и https");
    }

    const res = await fetch(parsed, { redirect: "follow" });
    if (!res.ok) return fail(`Картинка не скачалась: ${res.status}`);
    const mime = res.headers.get("content-type") ?? "";
    if (!mime.startsWith("image/")) return fail(`По ссылке не картинка, а ${mime || "непонятно что"}`);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return fail("Картинка больше 8 МБ");
    input = buf;
    source = parsed.hostname;
  } else {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Файл не передан");
    if (file.size > MAX_BYTES) return fail("Файл больше 8 МБ");
    if (!file.type.startsWith("image/")) return fail("Только изображения");
    input = Buffer.from(await file.arrayBuffer());
    source = "файлом";
  }

  let webp: Buffer;
  try {
    webp = await toWebp(input);
  } catch {
    return fail("Не удалось обработать изображение");
  }

  const url = await save(webp);

  // Новое фото встаёт в конец. Первое по порядку – обложка карточки.
  const last = await prisma.productPhoto.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const photo = await prisma.productPhoto.create({
    data: { productId, url, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  ctx.audit(`фото #${photo.id} к товару #${productId} (${source})`);
  revalidatePath("/products");
  return ok({ photo }, 201);
});
