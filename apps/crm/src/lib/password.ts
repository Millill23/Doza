import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Проверка пароля. Поддерживает два формата:
 *  - "dev$<sha256hex>" — упрощённый формат из dev-сида
 *  - bcrypt-хеш — для пользователей, созданных через CRM
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (hash.startsWith("dev$")) {
    const expected = createHash("sha256").update(password).digest("hex");
    return hash.slice(4) === expected;
  }
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
