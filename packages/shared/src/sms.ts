/**
 * Отправка SMS через sms-assistent.by (API PLAIN).
 * Креды берутся из окружения: SMS_LOGIN, SMS_PASSWORD, SMS_SENDER.
 * Тихо пропускается (ok:false), если креды не заданы — удобно для dev.
 */

const SEND_URL = "https://userarea.sms-assistent.by/api/v1/send_sms/plain";

export interface SmsResult {
  ok: boolean;
  code?: string; // код результата от API (id сообщения при успехе)
  error?: string;
}

/** Нормализация телефона к формату 375XXXXXXXXX (только цифры). */
export function smsPhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("80")) d = "375" + d.slice(2); // 80XX... → 375XX...
  if (d.length === 9) d = "375" + d; // XXXXXXXXX → 375XXXXXXXXX
  return d;
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const user = process.env.SMS_LOGIN;
  const password = process.env.SMS_PASSWORD;
  const sender = process.env.SMS_SENDER || "doza-parfum";

  if (!user || !password) {
    console.info("[sms] пропущено (нет SMS_LOGIN/SMS_PASSWORD). Текст:", message);
    return { ok: false, error: "SMS не настроены" };
  }

  const url = new URL(SEND_URL);
  url.searchParams.set("user", user);
  url.searchParams.set("password", password);
  url.searchParams.set("recipient", smsPhone(phone));
  url.searchParams.set("message", message);
  url.searchParams.set("sender", sender);

  try {
    const res = await fetch(url.toString(), { method: "GET" });
    const text = (await res.text()).trim();
    // API возвращает код результата: положительное число (id сообщения) = успех,
    // отрицательное / нечисловое с текстом ошибки = неудача.
    const asNum = Number(text);
    if (res.ok && Number.isFinite(asNum) && asNum > 0) {
      return { ok: true, code: text };
    }
    return { ok: false, code: text, error: `Ошибка SMS: ${text}` };
  } catch (e) {
    console.error("[sms] ошибка отправки:", e);
    return { ok: false, error: "Сбой отправки SMS" };
  }
}

/** Сгенерировать числовой код подтверждения (по умолчанию 6 цифр). */
export function generateSmsCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 10);
  return s;
}
