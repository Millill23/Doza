import { useState } from "react";

/**
 * Поле пароля с кнопкой «показать».
 *
 * Длинный пароль вслепую набирается с ошибкой, а на телефоне — почти всегда.
 * Сгенерированный при восстановлении пароль вида «kR7mPq2x» без возможности
 * его увидеть превращает вход в лотерею.
 *
 * Кнопка не попадает в обход по Tab (`tabIndex={-1}`): она между полем и
 * кнопкой отправки, и пробел на ней вместо «Войти» — раздражающая мелочь.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  required = false,
  minLength,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="h-11 w-full rounded-lg border border-ink-600 bg-ink-800 pl-3 pr-12 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
        title={shown ? "Скрыть пароль" : "Показать пароль"}
        className="absolute right-1 top-1/2 flex h-9 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ivory-faint transition-colors hover:text-gold-400"
      >
        {shown ? (
          // Перечёркнутый глаз — пароль сейчас виден, нажатие спрячет.
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.7 17.7 0 0 0 2 12s4 7 10 7a10.8 10.8 0 0 0 4.9-1.1" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            <path d="m2 2 20 20" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
