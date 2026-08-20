import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AstroCookies } from "astro";
import { prisma } from "@doza/db";

/**
 * Лёгкая сессия покупателя: подписанный HMAC-токен в httpOnly cookie.
 * Формат токена: base64url(JSON payload).hmac
 */

const COOKIE = "doza_customer";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

function secret(): string {
  return process.env.NEXTAUTH_SECRET || "dev_customer_secret_change_me";
}

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(customerId: number): string {
  const payload = b64url(
    JSON.stringify({ id: customerId, iat: Date.now() }),
  );
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  try {
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.id !== "number") return null;
    return data.id;
  } catch {
    return null;
  }
}

// ── Хелперы для Astro cookies ────────────────────────────────────────────────

export function setSession(cookies: AstroCookies, customerId: number) {
  cookies.set(COOKIE, createSessionToken(customerId), {
    httpOnly: true,
    secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: "/" });
}

export function getCustomerId(cookies: AstroCookies): number | null {
  return verifySessionToken(cookies.get(COOKIE)?.value);
}

/**
 * Клиент текущей сессии — или null, если её нет либо клиента уже удалили.
 *
 * Одной подписи cookie мало: она остаётся валидной и после того, как клиента
 * убрали из базы. Из-за этого страницы отфутболивали друг друга по кругу —
 * `/login` видел сессию и отправлял в кабинет, кабинет не находил клиента и
 * отправлял обратно, а браузер упирался в ERR_TOO_MANY_REDIRECTS. Выйти можно
 * было только вручную почистив cookie. Поэтому мёртвую сессию здесь же и гасим.
 */
export async function currentCustomerId(
  cookies: AstroCookies,
): Promise<number | null> {
  const id = getCustomerId(cookies);
  if (id === null) return null;

  const exists = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) {
    clearSession(cookies);
    return null;
  }
  return id;
}

// ── Пароли ───────────────────────────────────────────────────────────────────

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function checkPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
