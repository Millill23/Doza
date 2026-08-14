/**
 * Тесты правил отправки SMS.
 * Запуск: node --test packages/db/src/sms-rules.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSendConsentSms,
  CONSENT_MAX_MESSAGES,
  CONSENT_RESEND_COOLDOWN_DAYS,
  SMS_KINDS,
  SMS_KIND_LIST,
  isSmsKind,
  smsKindSettingKey,
} from "./sms-rules.ts";

const NOW = new Date("2026-08-14T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("первое сообщение разрешено", () => {
  assert.deepEqual(canSendConsentSms({ sent: 0, lastSentAt: null }, NOW), {
    allowed: true,
  });
});

test("повтор на следующий день запрещён", () => {
  // Ровно тот случай, из-за которого клиенты получали по SMS в день.
  const v = canSendConsentSms({ sent: 1, lastSentAt: daysAgo(1) }, NOW);
  assert.equal(v.allowed, false);
  assert.match(v.allowed === false ? v.reason : "", /через 6 дн/);
});

test("повтор разрешён после паузы", () => {
  assert.equal(
    canSendConsentSms(
      { sent: 1, lastSentAt: daysAgo(CONSENT_RESEND_COOLDOWN_DAYS + 1) },
      NOW,
    ).allowed,
    true,
  );
});

test("граница паузы: ровно неделя ещё рано, неделя и час — можно", () => {
  const exact = new Date(NOW.getTime() - CONSENT_RESEND_COOLDOWN_DAYS * 86_400_000);
  assert.equal(canSendConsentSms({ sent: 1, lastSentAt: exact }, NOW).allowed, true);
  const almost = new Date(exact.getTime() + 3_600_000);
  assert.equal(canSendConsentSms({ sent: 1, lastSentAt: almost }, NOW).allowed, false);
});

test("лимит сообщений исчерпан — не шлём даже после паузы", () => {
  const v = canSendConsentSms(
    { sent: CONSENT_MAX_MESSAGES, lastSentAt: daysAgo(365) },
    NOW,
  );
  assert.equal(v.allowed, false);
  assert.match(v.allowed === false ? v.reason : "", /больше не напоминаем/);
});

test("служебные категории помечены и их нельзя выключить по смыслу", () => {
  // Коды подтверждения и пароль — без них ломается сценарий, а не «меньше спама».
  for (const k of ["otp_register", "otp_loyalty_spend", "password_reset"] as const) {
    assert.equal(SMS_KINDS[k].required, true, `${k} должен быть служебным`);
  }
  for (const k of ["consent_reminder", "purchase", "vip_welcome"] as const) {
    assert.equal(SMS_KINDS[k].required, false, `${k} должен отключаться`);
  }
});

test("у каждой категории свой ключ настройки и все они распознаются", () => {
  const keys = new Set(SMS_KIND_LIST.map(smsKindSettingKey));
  assert.equal(keys.size, SMS_KIND_LIST.length, "ключи настроек дублируются");
  for (const k of SMS_KIND_LIST) assert.equal(isSmsKind(k), true);
  assert.equal(isSmsKind("нет_такой"), false);
});
