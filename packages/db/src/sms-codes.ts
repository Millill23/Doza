import { Prisma } from "@prisma/client";
import { prisma } from "./index";

/**
 * Одноразовые SMS-коды подтверждения.
 * purpose: register | reset | loyalty_spend | offline_register
 */

const TTL_MS = 10 * 60 * 1000; // 10 минут
const MAX_ATTEMPTS = 5;

function gen(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Создать код (инвалидируя предыдущие для этого телефона+назначения). Возвращает код. */
export async function createSmsCode(
  phone: string,
  purpose: string,
  meta?: Record<string, unknown>,
): Promise<string> {
  const code = gen();
  await prisma.smsCode.updateMany({
    where: { phone, purpose, consumed: false },
    data: { consumed: true },
  });
  await prisma.smsCode.create({
    data: {
      phone,
      purpose,
      code,
      meta: (meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return code;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
  meta?: unknown;
}

/** Проверить код. При успехе помечает его использованным. */
export async function verifySmsCode(
  phone: string,
  purpose: string,
  code: string,
): Promise<VerifyResult> {
  const rec = await prisma.smsCode.findFirst({
    where: { phone, purpose, consumed: false },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return { ok: false, error: "Код не найден. Запросите новый." };
  if (rec.expiresAt < new Date())
    return { ok: false, error: "Срок действия кода истёк." };
  if (rec.attempts >= MAX_ATTEMPTS)
    return { ok: false, error: "Слишком много попыток. Запросите новый код." };

  if (rec.code !== code.trim()) {
    await prisma.smsCode.update({
      where: { id: rec.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Неверный код." };
  }

  await prisma.smsCode.update({
    where: { id: rec.id },
    data: { consumed: true },
  });
  return { ok: true, meta: rec.meta };
}
