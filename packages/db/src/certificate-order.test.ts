/**
 * Тесты покупки сертификата на сайте.
 * Запуск: node --test packages/db/src/certificate-order-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  certificatePrice,
  needsShipping,
  validateCertificateLine,
  validateCertificateLines,
  giftSmsText,
  isValidDenomination,
  MAX_CERTIFICATES_PER_ORDER,
  GIFT_MESSAGE_MAX,
} from "./certificate-rules.ts";

test("номинал берётся только из списка", () => {
  assert.equal(isValidDenomination(100), true);
  assert.equal(isValidDenomination(300), true);
  // Иначе покупатель пришлёт сертификат на 1 рубль или на миллион.
  assert.equal(isValidDenomination(137), false);
  assert.equal(isValidDenomination(0), false);
  assert.equal(isValidDenomination(-100), false);
});

// ── Цена ────────────────────────────────────────────────────────────────────

test("без VIP сертификат стоит номинал", () => {
  assert.equal(certificatePrice(300, 0), 300);
});

test("VIP покупает дешевле, но тратит полный номинал", () => {
  // Скидка касается покупки сертификата, а не его ценности — так же, как в
  // офлайн-кассе. Иначе один сертификат стоил бы по-разному в зале и на сайте.
  assert.equal(certificatePrice(300, 20), 240);
  assert.equal(certificatePrice(50, 20), 40);
});

test("кривой процент не ломает цену", () => {
  assert.equal(certificatePrice(100, NaN), 100);
  assert.equal(certificatePrice(100, -5), 100);
  assert.equal(certificatePrice(100, 500), 0);
});

// ── Доставка ────────────────────────────────────────────────────────────────

test("только электронные сертификаты — доставка не нужна", () => {
  assert.equal(
    needsShipping({ hasProducts: false, certificates: [{ denomination: 100, sendBySms: true }] }),
    false,
  );
});

test("бумажный сертификат везём почтой", () => {
  assert.equal(
    needsShipping({ hasProducts: false, certificates: [{ denomination: 100 }] }),
    true,
  );
});

test("духи в заказе — доставка нужна в любом случае", () => {
  assert.equal(
    needsShipping({ hasProducts: true, certificates: [{ denomination: 100, sendBySms: true }] }),
    true,
  );
});

test("смешанный заказ: один электронный, один бумажный — везём", () => {
  assert.equal(
    needsShipping({
      hasProducts: false,
      certificates: [
        { denomination: 100, sendBySms: true },
        { denomination: 200 },
      ],
    }),
    true,
  );
});

// ── Проверка строки ─────────────────────────────────────────────────────────

test("при оформлении для электронного нужен номер получателя", () => {
  const v = validateCertificateLine(
    { denomination: 100, sendBySms: true },
    { requireRecipient: true },
  );
  assert.equal(v.ok, false);
  assert.ok(!v.ok && /номер/.test(v.error));
});

test("в предпросмотре корзины номер не требуется", () => {
  // Телефон получателя незачем гонять на сервер при каждом пересчёте, и
  // подарок не должен «дорожать» из-за того, что до формы ещё не дошли.
  const v = validateCertificateLine({ denomination: 100, sendBySms: true });
  assert.equal(v.ok, true);
});

test("бумажному номер получателя не нужен", () => {
  assert.equal(validateCertificateLine({ denomination: 100 }).ok, true);
});

test("поздравление ограничено по длине", () => {
  const v = validateCertificateLine(
    {
      denomination: 100,
      sendBySms: true,
      recipientPhone: "375291234567",
      message: "я".repeat(GIFT_MESSAGE_MAX + 1),
    },
    { requireRecipient: true },
  );
  assert.equal(v.ok, false);
  assert.ok(!v.ok && /длиннее/.test(v.error));
});

test("слишком много сертификатов за раз не берём", () => {
  const many = Array.from({ length: MAX_CERTIFICATES_PER_ORDER + 1 }, () => ({
    denomination: 50,
  }));
  const v = validateCertificateLines(many);
  assert.equal(v.ok, false);
  assert.ok(!v.ok && /не больше/.test(v.error));
});

test("ошибка одной строки останавливает весь набор", () => {
  const v = validateCertificateLines([
    { denomination: 100 },
    { denomination: 999 },
  ]);
  assert.equal(v.ok, false);
});

// ── SMS получателю ──────────────────────────────────────────────────────────

test("в SMS есть ссылка, имя получателя и дарителя", () => {
  const t = giftSmsText({
    link: "https://doza-parfum.by/gift/abc",
    fromName: "Кирилл",
    recipientName: "Анна",
  });
  assert.match(t, /Анна, вам/);
  assert.match(t, /Отправитель: Кирилл/);
  assert.match(t, /doza-parfum\.by\/gift\/abc/);
});

test("без имён сообщение остаётся связным", () => {
  // Имена необязательны, и «, вам подарочный» с пустотой в начале читается
  // как ошибка магазина.
  const t = giftSmsText({ link: "https://x/gift/a" });
  assert.match(t, /^Вам подарочный сертификат DOZA\. Открыть: /);
});
