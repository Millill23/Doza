import { NextResponse } from "next/server";

/**
 * Проверка ключа фоновых задач.
 *
 * Незаполненный `CRON_SECRET` разбирается отдельно от неверного ключа, хотя
 * раньше оба давали 403. Это стоило месяца молчания: на боевом сервере
 * переменную не заполнили, каждый вызов отбивался как «доступ запрещён»,
 * планировщик глотал ответ, а подарки клиентам не выдавались вообще. Снаружи
 * забытая настройка выглядела точно так же, как попытка взлома.
 *
 * Возвращает `null`, если запрос можно выполнять.
 */
export function checkCronKey(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error(
      "[cron] CRON_SECRET не задан — фоновые задачи не выполняются. " +
        "Добавьте переменную в .env и перезапустите контейнеры.",
    );
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET не задан на сервере — задача не может выполниться",
      },
      { status: 500 },
    );
  }

  const key = new URL(request.url).searchParams.get("key");
  if (key !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return null;
}
