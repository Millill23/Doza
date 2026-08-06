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
  CODE_LENGTH,
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
