/**
 * Уведомления в Telegram через Bot API (plain HTTP POST).
 * Общая реализация для сайта и CRM — раньше в каждом приложении была своя
 * копия, и правки приходилось дублировать.
 *
 * Тихо пропускается, если токен/chat_id не заданы (удобно в dev).
 */

/**
 * Экранировать текст для parse_mode: "HTML".
 *
 * Не декоративная мелочь: Telegram отклоняет сообщение целиком, если в тексте
 * встретится что-то похожее на незакрытый тег. Из-за этого имя клиента «<3»
 * ломало отправку всех уведомлений о продаже. Экранируем любые данные,
 * пришедшие от пользователя (имена, названия товаров, комментарии, причины).
 */
export function tgEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Получатели: общий канал + дополнительные (личные) чаты из окружения. */
function recipients(chatIdOverride?: string): string[] {
  if (chatIdOverride) return [chatIdOverride];

  const list: string[] = [];
  const channel = process.env.TELEGRAM_CHAT_ID;
  if (channel) list.push(channel);

  // TELEGRAM_EXTRA_CHAT_IDS — список через запятую: копия уведомлений
  // конкретным людям помимо канала.
  const extra = process.env.TELEGRAM_EXTRA_CHAT_IDS ?? "";
  for (const id of extra.split(",")) {
    const trimmed = id.trim();
    if (trimmed && !list.includes(trimmed)) list.push(trimmed);
  }
  return list;
}

async function sendTo(token: string, chatId: string, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      // Тело ответа помогает понять причину (чаще всего — битая HTML-разметка
      // или бот не может писать этому пользователю, пока тот не начал диалог).
      const body = await res.text().catch(() => "");
      console.error(`[telegram] chat ${chatId}: ${res.status} ${body.slice(0, 300)}`);
    }
  } catch (e) {
    console.error(`[telegram] ошибка отправки в chat ${chatId}:`, e);
  }
}

/**
 * Отправить уведомление. Уходит в общий канал и всем дополнительным
 * получателям; сбой по одному адресату не мешает остальным.
 */
export async function notifyTelegram(
  text: string,
  chatIdOverride?: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = recipients(chatIdOverride);

  if (!token || chats.length === 0) {
    console.info("[telegram] пропущено (нет TELEGRAM_BOT_TOKEN/CHAT_ID)");
    return;
  }

  await Promise.all(chats.map((chatId) => sendTo(token, chatId, text)));
}
