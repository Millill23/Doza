import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Абсолютный путь к общему каталогу загрузок.
 * Приоритет: переменная окружения UPLOADS_DIR, иначе <корень монорепо>/uploads.
 * Корень ищется поднятием от cwd до каталога с pnpm-workspace.yaml.
 */
export function getUploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return join(dir, "uploads");
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // запасной вариант: два уровня вверх (apps/<app> → корень)
  return join(process.cwd(), "..", "..", "uploads");
}

/** Публичный URL-путь, по которому отдаются загрузки. */
export const UPLOADS_URL_PREFIX = "/uploads";

/** MIME-тип по расширению файла загрузки. */
export function uploadMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webp": return "image/webp";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "avif": return "image/avif";
    default: return "application/octet-stream";
  }
}
