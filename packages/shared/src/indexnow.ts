/**
 * IndexNow — мгновенное уведомление поисковиков (Яндекс, Bing) об изменении страниц.
 * Ключ должен быть доступен по адресу https://<host>/<KEY>.txt (содержимое = сам ключ).
 */
export const INDEXNOW_KEY = "67aad69650e0d5e33d4fab6aab47ee9e";
export const SITE_HOST = "doza-parfum.by";

export async function submitIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
  } catch (e) {
    console.error("[indexnow] ошибка отправки:", e);
  }
}
