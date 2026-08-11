/**
 * Тесты правил согласия на обработку ПД.
 * Запуск: node --test packages/db/src/consent-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isConsentOverdue,
  daysSinceRequest,
  consentLink,
  CONSENT_SMS,
  CONSENT_TTL_DAYS,
} from "./consent-rules.ts";

const NOW = new Date("2026-08-11T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("подтвердивший клиент не бывает просроченным", () => {
  assert.equal(
    isConsentOverdue(
      { consentStatus: "confirmed", consentRequestedAt: daysAgo(365) },
      NOW,
    ),
    false,
  );
});

test("без отправленного запроса удалять нельзя", () => {
  // Человек не знал, что от него чего-то ждут — молчание не его вина.
  assert.equal(
    isConsentOverdue({ consentStatus: "pending", consentRequestedAt: null }, NOW),
    false,
  );
});

test("просрочка наступает строго после срока", () => {
  const pending = (d: number) => ({
    consentStatus: "pending",
    consentRequestedAt: daysAgo(d),
  });
  assert.equal(isConsentOverdue(pending(CONSENT_TTL_DAYS - 1), NOW), false);
  // Ровно 30 дней — ещё не просрочка, у клиента есть весь последний день.
  assert.equal(isConsentOverdue(pending(CONSENT_TTL_DAYS), NOW), false);
  assert.equal(isConsentOverdue(pending(CONSENT_TTL_DAYS + 1), NOW), true);
});

test("считаем дни с момента запроса", () => {
  assert.equal(
    daysSinceRequest({ consentStatus: "pending", consentRequestedAt: daysAgo(5) }, NOW),
    5,
  );
  assert.equal(
    daysSinceRequest({ consentStatus: "pending", consentRequestedAt: null }, NOW),
    null,
  );
});

test("ссылка не двоит слеш, если адрес задан со слешем", () => {
  assert.equal(
    consentLink("https://doza-parfum.by/", "abc123"),
    "https://doza-parfum.by/consent/abc123",
  );
  assert.equal(
    consentLink("https://doza-parfum.by", "abc123"),
    "https://doza-parfum.by/consent/abc123",
  );
});

test("тексты SMS содержат ссылку и влезают в два сегмента", () => {
  const link = consentLink("https://doza-parfum.by", "a".repeat(24));
  for (const kind of ["invite", "reminder"] as const) {
    const text = CONSENT_SMS[kind](link);
    assert.ok(text.includes(link), `${kind}: нет ссылки`);
    // Кириллица кодируется UCS-2 — 70 знаков на сегмент. Держимся в двух,
    // иначе рассылка по всей базе дорожает в полтора раза.
    assert.ok(text.length <= 140, `${kind}: ${text.length} знаков, больше двух SMS`);
  }
});
