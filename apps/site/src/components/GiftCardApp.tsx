import { useState } from "react";
import PhoneInput from "./PhoneInput";
import { addGift } from "../lib/gift-cart";
import { isValidLocalDigits, PHONE_ERROR } from "@doza/shared/phone";
import { formatByn } from "@doza/shared";

/**
 * Покупка подарочного сертификата.
 *
 * Бумажную карточку везём почтой вместе с духами, электронную отправляем
 * ссылкой в SMS — тогда доставка не нужна вовсе.
 */

const MESSAGE_MAX = 200;

export default function GiftCardApp({
  denominations,
  lifetimeDays,
}: {
  denominations: number[];
  lifetimeDays: number;
}) {
  const [denomination, setDenomination] = useState(denominations[2] ?? denominations[0]);
  const [bySms, setBySms] = useState(false);
  const [phone, setPhone] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  function add() {
    setError(null);
    if (bySms && !isValidLocalDigits(phone)) {
      setError("Проверьте номер получателя: " + PHONE_ERROR.toLowerCase());
      return;
    }
    addGift({
      denomination,
      sendBySms: bySms,
      recipientPhone: bySms ? phone : undefined,
      recipientName: bySms ? recipient.trim() || undefined : undefined,
      message: bySms ? message.trim() || undefined : undefined,
    });
    setAdded(true);
    setMessage("");
    setRecipient("");
    setPhone("");
    setBySms(false);
  }

  const labelCls = "mb-1.5 block text-xs uppercase tracking-luxe text-gold-500";
  const inputCls =
    "h-11 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <span className={labelCls}>Номинал</span>
        <div className="grid grid-cols-3 gap-2">
          {denominations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDenomination(d)}
              className={
                "min-h-[52px] cursor-pointer rounded-lg border text-base transition-colors " +
                (denomination === d
                  ? "border-gold-500 bg-gold-500/10 text-gold-300"
                  : "border-ink-600 text-ivory-muted hover:border-gold-600/60")
              }
            >
              {d} BYN
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-600 bg-ink-800/60 p-3.5 text-sm text-ivory">
        <input
          type="checkbox"
          checked={bySms}
          onChange={(e) => {
            setBySms(e.target.checked);
            setAdded(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
        />
        <span>
          Отправить электронную версию сертификата в SMS
          <span className="mt-0.5 block text-xs font-light text-ivory-faint">
            Получатель откроет ссылку и увидит сертификат с кодом. Бумажную
            карточку тогда не везём — доставка не нужна.
          </span>
        </span>
      </label>

      {bySms && (
        <div className="space-y-4 rounded-lg border border-gold-600/40 bg-gold-500/5 p-4">
          <div>
            <label htmlFor="g-phone" className={labelCls}>
              Кому отправить
            </label>
            <PhoneInput id="g-phone" value={phone} onChange={setPhone} required />
          </div>
          <div>
            <label htmlFor="g-name" className={labelCls}>
              Имя получателя
            </label>
            <input
              id="g-name"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Необязательно"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="g-msg" className={labelCls}>
              Поздравление
            </label>
            <textarea
              id="g-msg"
              rows={3}
              maxLength={MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Напишите пару слов — они появятся на странице сертификата"
              className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint focus:border-gold-500 focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-ivory-faint">
              {message.length} / {MESSAGE_MAX}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-ink-600/60 pt-4">
        <span className="text-sm text-ivory-muted">К оплате</span>
        <span className="font-serif text-2xl text-gold-gradient">
          {formatByn(denomination)}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-ivory-faint">
        Если у вас VIP-карта, войдите в кабинет — сертификат обойдётся дешевле,
        а потратить его можно будет на полный номинал.
      </p>

      <button
        type="button"
        onClick={add}
        className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-gold-gradient text-base font-medium text-ink-900 shadow-gold transition-all hover:shadow-gold-lg"
      >
        Добавить в корзину
      </button>

      {added && (
        <p className="rounded-lg border border-botanical-500/40 bg-botanical-700/20 p-3 text-center text-sm text-ivory">
          Сертификат в корзине.{" "}
          <a href="/cart" className="text-gold-400 hover:text-gold-300">
            Перейти к оформлению
          </a>
        </p>
      )}

      <p className="text-center text-xs text-ivory-faint">
        Сертификат действует {lifetimeDays} дней с момента покупки. Остаток не
        сгорает: потратить можно за несколько визитов.
      </p>
    </div>
  );
}
