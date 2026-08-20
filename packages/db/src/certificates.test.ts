/**
 * Тесты подарочных сертификатов.
 * Запуск: node --test packages/db/src/certificates.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCertificateCode,
  normalizeCertificateCode,
  isValidCertificateCode,
  certificateAward,
  certificateExpiresAt,
  daysLeft,
  canRedeem,
  canActivate,
  applyCertificate,
  CODE_LENGTH,
  CERTIFICATE_LIFETIME_DAYS,
  type CertificateState,
} from "./certificate-rules.ts";

test("код: 8 символов, только верхний регистр и цифры", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCertificateCode();
    assert.equal(code.length, CODE_LENGTH);
    assert.match(code, /^[A-Z0-9]{8}$/);
  }
});

test("код не содержит легко путаемых символов O, 0, I, 1", () => {
  for (let i = 0; i < 500; i++) {
    const code = generateCertificateCode();
    assert.ok(!/[O0I1]/.test(code), `в коде ${code} есть путаемый символ`);
  }
});

test("код: сгенерированный проходит собственную валидацию", () => {
  for (let i = 0; i < 100; i++) {
    assert.ok(isValidCertificateCode(generateCertificateCode()));
  }
});

test("код: коды не повторяются на большой выборке", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(generateCertificateCode());
  // при 32^8 вариантов коллизий на 5000 быть не должно
  assert.equal(seen.size, 5000);
});

test("нормализация: регистр, пробелы и дефисы", () => {
  assert.equal(normalizeCertificateCode("abcd2345"), "ABCD2345");
  assert.equal(normalizeCertificateCode("ABCD-2345"), "ABCD2345");
  assert.equal(normalizeCertificateCode(" abcd 2345 "), "ABCD2345");
});

test("валидация отсекает мусор", () => {
  assert.equal(isValidCertificateCode("SHORT"), false);
  assert.equal(isValidCertificateCode("TOOLONGCODE"), false);
  // O и 1 не входят в алфавит
  assert.equal(isValidCertificateCode("ABCD01OI"), false);
  assert.equal(isValidCertificateCode(""), false);
});

// ── Правило начисления ──────────────────────────────────────────────────────

test("не-VIP активирует — начисляется номинал", () => {
  assert.equal(
    certificateAward({ denomination: 100, paidByn: 80, activatorIsVip: false }),
    100,
  );
});

test("VIP активирует — начисляется уплаченная сумма", () => {
  assert.equal(
    certificateAward({ denomination: 100, paidByn: 80, activatorIsVip: true }),
    80,
  );
});

test("сертификат куплен без скидки — VIP получает столько же, сколько все", () => {
  assert.equal(
    certificateAward({ denomination: 100, paidByn: 100, activatorIsVip: true }),
    100,
  );
});

test("начисление не может быть отрицательным", () => {
  assert.equal(
    certificateAward({ denomination: 100, paidByn: -50, activatorIsVip: true }),
    0,
  );
});

test("копейки округляются", () => {
  assert.equal(
    certificateAward({ denomination: 100, paidByn: 83.333, activatorIsVip: true }),
    83.33,
  );
});

// ── Срок жизни ──────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-01T12:00:00Z");

/** Сертификат, выпущенный `issuedDaysAgo` дней назад. */
function cert(over: Partial<CertificateState> & { issuedDaysAgo?: number } = {}): CertificateState {
  const issuedAt = new Date(NOW.getTime() - (over.issuedDaysAgo ?? 0) * DAY);
  return {
    status: "new",
    denomination: 300,
    balanceByn: 300,
    expiresAt: certificateExpiresAt(issuedAt),
    ...over,
  };
}

test("срок считается от выпуска и равен 180 дням", () => {
  const issued = new Date("2026-01-01T00:00:00Z");
  const expires = certificateExpiresAt(issued);
  assert.equal(
    (expires.getTime() - issued.getTime()) / DAY,
    CERTIFICATE_LIFETIME_DAYS,
  );
});

test("осталось дней: считается вверх, после срока — ноль", () => {
  assert.equal(daysLeft(new Date(NOW.getTime() + 10 * DAY), NOW), 10);
  assert.equal(daysLeft(new Date(NOW.getTime() + 0.5 * DAY), NOW), 1, "полдня — ещё день");
  assert.equal(daysLeft(new Date(NOW.getTime() - DAY), NOW), 0);
});

test("свежий сертификат принимается к оплате", () => {
  const v = canRedeem(cert({ issuedDaysAgo: 179 }), NOW);
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.balance, 300);
});

test("сертификат старше 180 дней к оплате не принимается", () => {
  const v = canRedeem(cert({ issuedDaysAgo: 181 }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.reason : "", /срок действия истёк/i);
});

// ── Что мешает расплатиться ─────────────────────────────────────────────────

test("обменянный на баллы сертификат к оплате не принимается", () => {
  // Иначе номинал достался бы покупателю дважды: баллами и товаром.
  const v = canRedeem(cert({ status: "activated", balanceByn: 0 }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.reason : "", /баллы/i);
});

test("аннулированный и потраченный сертификат к оплате не принимаются", () => {
  assert.equal(canRedeem(cert({ status: "cancelled" }), NOW).ok, false);
  assert.equal(canRedeem(cert({ status: "spent", balanceByn: 0 }), NOW).ok, false);
  assert.equal(canRedeem(cert({ balanceByn: 0 }), NOW).ok, false, "нулевой остаток");
});

// ── Что мешает обменять на баллы ────────────────────────────────────────────

test("нетронутый сертификат можно обменять на баллы", () => {
  assert.equal(canActivate(cert(), NOW).ok, true);
});

test("частично потраченный в кассе на баллы не меняется", () => {
  // Способы не смешиваются: иначе за 147 оставшихся начислили бы 300 баллов.
  const v = canActivate(cert({ balanceByn: 147 }), NOW);
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.reason : "", /147/);
});

test("просроченный сертификат на баллы не меняется", () => {
  assert.equal(canActivate(cert({ issuedDaysAgo: 200 }), NOW).ok, false);
});

// ── Списание с остатком ─────────────────────────────────────────────────────

test("чек меньше сертификата — остаток сохраняется", () => {
  const r = applyCertificate({ balance: 300, due: 153 });
  assert.equal(r.applied, 153);
  assert.equal(r.remaining, 147);
  assert.equal(r.toPay, 0);
});

test("чек больше сертификата — разницу доплачивают деньгами", () => {
  const r = applyCertificate({ balance: 50, due: 153 });
  assert.equal(r.applied, 50);
  assert.equal(r.remaining, 0);
  assert.equal(r.toPay, 103);
});

test("чек ровно на остаток — сертификат закрывается в ноль", () => {
  const r = applyCertificate({ balance: 147, due: 147 });
  assert.equal(r.applied, 147);
  assert.equal(r.remaining, 0);
  assert.equal(r.toPay, 0);
});

test("остаток донабирают следующей покупкой", () => {
  // Тот самый сценарий из задачи: 300 → покупка на 153 → потом ещё на 100.
  const first = applyCertificate({ balance: 300, due: 153 });
  const second = applyCertificate({ balance: first.remaining, due: 100 });
  assert.equal(second.applied, 100);
  assert.equal(second.remaining, 47);
});

test("копейки не размножаются", () => {
  const r = applyCertificate({ balance: 100, due: 33.335 });
  assert.equal(r.applied, 33.34);
  assert.equal(r.remaining, 66.66);
  assert.equal(Math.round((r.applied + r.remaining) * 100) / 100, 100);
});

test("нулевой чек ничего не списывает", () => {
  const r = applyCertificate({ balance: 300, due: 0 });
  assert.equal(r.applied, 0);
  assert.equal(r.remaining, 300);
});

test("отрицательные значения не уводят остаток в минус", () => {
  const r = applyCertificate({ balance: 300, due: -50 });
  assert.equal(r.applied, 0);
  assert.equal(r.remaining, 300);
});
