import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getUploadsDir, UPLOADS_URL_PREFIX } from "@doza/shared/uploads";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Файл не передан" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Файл больше 8 МБ" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "Только изображения" }, { status: 400 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  // Конвертация в WebP с ресайзом под карточку товара
  let webp: Buffer;
  try {
    webp = await sharp(input)
      .rotate()
      .resize(1000, 1333, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ ok: false, error: "Не удалось обработать изображение" }, { status: 400 });
  }

  const name = `${Date.now()}-${randomBytes(4).toString("hex")}.webp`;
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), webp);

  return NextResponse.json({ ok: true, url: `${UPLOADS_URL_PREFIX}/${name}` });
}
