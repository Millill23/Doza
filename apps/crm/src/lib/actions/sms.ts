"use server";

import { prisma } from "@doza/db";
import {
  SMS_KIND_LIST,
  SMS_MASTER_SETTING,
  SMS_TELEGRAM_SETTING,
  smsKindSettingKey,
  isSmsKind,
  SMS_KINDS,
} from "@doza/db/sms-rules";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/** Настройки и журнал SMS. Управление только у админа. */

async function readFlag(key: string, fallback = true): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key } });
  if (!s) return fallback;
  return s.value !== "0" && s.value !== "false";
}

export interface SmsSettings {
  master: boolean;
  telegram: boolean;
  kinds: Record<string, boolean>;
}

export async function getSmsSettings(): Promise<SmsSettings> {
  await requireRole(["admin"]);
  const kinds: Record<string, boolean> = {};
  for (const k of SMS_KIND_LIST) kinds[k] = await readFlag(smsKindSettingKey(k));
  return {
    master: await readFlag(SMS_MASTER_SETTING),
    // По умолчанию выключено: это временный инструмент наблюдения.
    telegram: await readFlag(SMS_TELEGRAM_SETTING, false),
    kinds,
  };
}

/** Дублировать каждую отправку в Telegram. */
export async function setSmsTelegramNotify(enabled: boolean) {
  await requireRole(["admin"]);
  const value = enabled ? "1" : "0";
  await prisma.setting.upsert({
    where: { key: SMS_TELEGRAM_SETTING },
    update: { value },
    create: { key: SMS_TELEGRAM_SETTING, value },
  });
  revalidatePath("/sms");
  return { ok: true };
}

/** Главный рубильник: выключает вообще все отправки. */
export async function setSmsMaster(enabled: boolean) {
  await requireRole(["admin"]);
  const value = enabled ? "1" : "0";
  await prisma.setting.upsert({
    where: { key: SMS_MASTER_SETTING },
    update: { value },
    create: { key: SMS_MASTER_SETTING, value },
  });
  revalidatePath("/sms");
  return { ok: true };
}

export async function setSmsKind(kind: string, enabled: boolean) {
  await requireRole(["admin"]);
  if (!isSmsKind(kind)) throw new Error("Неизвестная категория");
  // Служебные сообщения выключать нельзя: без кода подтверждения покупатель
  // не зарегистрируется и не спишет баллы, а выглядеть это будет как поломка.
  if (SMS_KINDS[kind].required && !enabled)
    throw new Error(
      `«${SMS_KINDS[kind].label}» отключить нельзя — без этого сообщения сценарий не работает`,
    );

  const key = smsKindSettingKey(kind);
  const value = enabled ? "1" : "0";
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  revalidatePath("/sms");
  return { ok: true };
}
