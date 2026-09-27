import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { prisma } from "@doza/db";

/**
 * Доступ к технической апишке.
 *
 * Токен передаётся заголовком `Authorization: Bearer <токен>`, а не параметром
 * в адресе, как у cron-роутов: параметры оседают в логах nginx в открытом
 * виде, заголовки – нет.
 *
 * Апишка умышленно ограничена каталогом и контентом. Ни клиентов, ни заказов,
 * ни денег в ней нет: токен живёт в переписке с тем, кто апишкой пользуется, и
 * считать его тайной нельзя. Каталог в худшем случае откатывается – он лежит в
 * git и в журнале; слитая клиентская база не откатывается никак.
 */

/** Минимальная длина: короткий токен перебирается, каким бы секретным ни был. */
const MIN_TOKEN_LENGTH = 32;

/**
 * Токен читаем при каждом запросе, а не один раз при загрузке модуля.
 * Иначе после правки `.env` апишка молчала бы «не настроена» до перезапуска,
 * и полчаса ушло бы на поиск несуществующей проблемы.
 */
function token(): string {
  return (process.env.ADMIN_API_TOKEN ?? "").trim();
}

export function apiTokenConfigured(): boolean {
  return token().length >= MIN_TOKEN_LENGTH;
}

/**
 * Сравнение, не зависящее от того, где строки разошлись.
 *
 * Обычное `===` выходит на первом несовпавшем байте, и по времени ответа токен
 * подбирается посимвольно. Сравниваем хеши фиксированной длины – заодно
 * снимается вопрос разной длины строк, на которой `timingSafeEqual` бросает.
 */
function sameToken(given: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token()).digest();
  return timingSafeEqual(a, b);
}

export interface ApiError {
  response: NextResponse;
}

/**
 * Проверить запрос. Возвращает `null`, если можно выполнять.
 *
 * Незаданный токен разбирается отдельно от неверного: на боевом сервере
 * забытая переменная выглядела бы как попытка взлома, и искать причину
 * пришлось бы наугад. Та же история уже была с `CRON_SECRET`.
 */
export function checkApiToken(request: Request): NextResponse | null {
  if (!apiTokenConfigured()) {
    console.error(
      "[api] ADMIN_API_TOKEN не задан или короче " +
        `${MIN_TOKEN_LENGTH} символов – техническая апишка отключена.`,
    );
    return json(
      { ok: false, error: "ADMIN_API_TOKEN не настроен на сервере" },
      503,
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !sameToken(given)) {
    return json({ ok: false, error: "Нужен заголовок Authorization: Bearer" }, 401);
  }

  return null;
}

/** Ответ в едином виде: у всех ручек одинаковая обёртка. */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function ok(data: unknown, status = 200): NextResponse {
  return json({ ok: true, ...(data as object) }, status);
}

export function fail(error: string, status = 400): NextResponse {
  return json({ ok: false, error }, status);
}

/**
 * Записать изменение в журнал.
 *
 * Только изменения: чтения не пишем, иначе таблица распухнет, а искать в ней
 * будет нечего. Сбой записи не должен ронять сам запрос – изменение уже
 * произошло, и отвечать ошибкой было бы враньём.
 */
export async function auditApi(
  request: Request,
  status: number,
  summary?: string,
): Promise<void> {
  if (request.method === "GET" || request.method === "HEAD") return;
  try {
    await prisma.adminApiLog.create({
      data: {
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        summary: summary ?? null,
      },
    });
  } catch (e) {
    console.error("[api] не удалось записать журнал:", e);
  }
}

/**
 * Обёртка для ручки: проверка токена, единый формат ошибки, журнал.
 *
 * Без неё каждая ручка повторяла бы один и тот же десяток строк, а забытая
 * проверка токена в одной из них открывала бы весь каталог наружу.
 */
export interface HandlerCtx {
  /** Что записать в журнал изменений. Для чтений не нужно. */
  audit: (summary: string) => void;
  /** Параметры маршрута: `[id]` и прочие. */
  params: Record<string, string>;
}

/**
 * Обёртка для ручки: проверка токена, единый формат ошибки, журнал.
 *
 * Без неё каждая ручка повторяла бы один и тот же десяток строк, а забытая
 * проверка токена в одной из них открывала бы каталог наружу.
 */
export function handler(
  fn: (request: Request, ctx: HandlerCtx) => Promise<NextResponse>,
) {
  return async (request: Request, routeCtx?: unknown): Promise<NextResponse> => {
    const denied = checkApiToken(request);
    if (denied) return denied;

    let summary = "";
    const ctx: HandlerCtx = {
      audit: (s: string) => {
        summary = s;
      },
      params: (routeCtx as { params?: Record<string, string> })?.params ?? {},
    };

    try {
      const res = await fn(request, ctx);
      await auditApi(request, res.status, summary || undefined);
      return res;
    } catch (e) {
      const message = (e as Error).message || "Внутренняя ошибка";
      console.error("[api]", request.method, request.url, e);
      await auditApi(request, 500, `ошибка: ${message}`);
      return fail(message, 500);
    }
  };
}

/** Тело запроса как объект. Кривой JSON – понятная ошибка, а не падение. */
export async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Ожидался JSON в теле запроса");
  }
}

/** Число из параметра маршрута. */
export function intParam(ctx: HandlerCtx, name: string): number {
  const n = Number(ctx.params[name]);
  if (!Number.isFinite(n)) throw new Error(`Неверный параметр ${name}`);
  return n;
}
