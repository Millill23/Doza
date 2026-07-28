/**
 * Отправка уведомлений в Telegram через Bot API (plain HTTP POST).
 * Тихо игнорируется, если токен/chat_id не заданы.
 * chatId по умолчанию — общий канал (TELEGRAM_CHAT_ID).
 */
export async function notifyTelegram(
  text: string,
  chatIdOverride?: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.info("[telegram] пропущено (нет TELEGRAM_BOT_TOKEN/CHAT_ID)");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("[telegram] ошибка отправки:", e);
  }
}
