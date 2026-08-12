"use client";

import {
  BELARUS_MOBILE_CODES,
  formatLocalDigits,
  isValidLocalDigits,
  digitsOnly,
  BELARUS_LOCAL_LENGTH,
} from "@doza/shared/phone";

/**
 * Ввод белорусского номера с несъёмным префиксом +375.
 *
 * Продавец набирает только 9 цифр — префикс нельзя стереть или испортить, а
 * буквы и лишние цифры просто не вводятся. Значение наружу отдаётся в виде
 * голых 9 цифр: полный номер собирается там, где уходит на сервер.
 */
export default function PhoneInput({
  value,
  onChange,
  onEnter,
  id,
  autoFocus,
  disabled,
  className = "",
}: {
  /** Локальная часть: до 9 цифр без префикса. */
  value: string;
  onChange: (localDigits: string) => void;
  onEnter?: () => void;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const complete = value.length === BELARUS_LOCAL_LENGTH;
  const valid = isValidLocalDigits(value);
  // Ругаемся только когда номер уже дописан: подсвечивать красным на второй
  // цифре — значит мешать вводу, а не помогать.
  const badCode = complete && !valid;

  return (
    <div className={className}>
      <div
        className={`flex h-10 items-center rounded-lg border bg-ink-800 pl-3 transition-colors focus-within:border-gold-500 ${
          badCode ? "border-red-500/60" : "border-ink-600"
        }`}
      >
        <span className="select-none pr-1 text-sm text-ivory-faint">+375</span>
        <input
          id={id}
          value={formatLocalDigits(value)}
          onChange={(e) =>
            onChange(digitsOnly(e.target.value).slice(0, BELARUS_LOCAL_LENGTH))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder="29 245-33-33"
          className="h-full flex-1 bg-transparent px-1 text-sm text-ivory placeholder:text-ivory-faint focus:outline-none disabled:opacity-60"
        />
      </div>
      {badCode && (
        <p className="mt-1 text-xs text-red-300">
          Код оператора должен быть {BELARUS_MOBILE_CODES.join(", ")}
        </p>
      )}
    </div>
  );
}
