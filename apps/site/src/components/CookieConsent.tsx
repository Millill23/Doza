import { useEffect, useState } from "react";

const KEY = "doza_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-ink-600/70 bg-ink-800/95 p-4 shadow-gold-lg backdrop-blur-md sm:p-5">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
        <p className="text-sm leading-relaxed text-ivory-muted">
          Мы используем файлы cookie для работы сайта (корзина, сессия) и аналитики.
          Продолжая пользоваться сайтом, вы соглашаетесь с их использованием и с{" "}
          <a href="/privacy" className="text-gold-400 underline-offset-2 hover:underline">
            Политикой обработки персональных данных
          </a>
          .
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-full bg-gold-gradient px-6 py-2.5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
