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
 * Номер — идентификатор покупателя: к нему привязаны баллы, заказ и вход в
 * кабинет. Поэтому префикс нельзя стереть, а всё кроме цифр не вводится.
 * Наружу отдаются голые 9 цифр, полный номер собирается при отправке.
 */
export default function PhoneInput({
  value,
  onChange,
  id,
  required,
  disabled,
  className = "",
}: {
  /** Локальная часть: до 9 цифр без префикса. */
  value: string;
  onChange: (localDigits: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const complete = value.length === BELARUS_LOCAL_LENGTH;
  const badCode = complete && !isValidLocalDigits(value);

  return (
    <div className={className}>
      <div
        className={`flex h-11 items-center rounded-lg border bg-ink-800 pl-3 transition-colors focus-within:border-gold-500 ${
          badCode ? "border-red-500/60" : "border-ink-600"
        }`}
      >
        <span className="select-none pr-1 text-sm text-ivory-faint">+375</span>
        <input
          id={id}
          type="tel"
          value={formatLocalDigits(value)}
          onChange={(e) =>
            onChange(digitsOnly(e.target.value).slice(0, BELARUS_LOCAL_LENGTH))
          }
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
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
