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
  canSendThrottledSms,
  isThrottledKind,
  SMS_DAILY_LIMIT,
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

// ── Частота служебных SMS ───────────────────────────────────────────────────

test("ограничиваем только код регистрации и сброс пароля", () => {
  // Уведомления о заказе и поздравления шлёт магазин по своей воле —
  // придерживать их незачем.
  assert.equal(isThrottledKind("otp_register"), true);
  assert.equal(isThrottledKind("password_reset"), true);
  assert.equal(isThrottledKind("order_paid"), false);
  assert.equal(isThrottledKind("birthday_gift"), false);
  assert.equal(isThrottledKind("otp_loyalty_spend"), false);
});

test("первое сообщение проходит", () => {
  const v = canSendThrottledSms({ lastSentAt: null, sentToday: 0 });
  assert.equal(v.allowed, true);
});

test("повтор раньше минуты отбивается", () => {
  const now = new Date("2026-08-31T12:00:00Z");
  const v = canSendThrottledSms(
    { lastSentAt: new Date("2026-08-31T11:59:30Z"), sentToday: 1 },
    now,
  );
  assert.equal(v.allowed, false);
  assert.ok(!v.allowed && v.retryAfterSec === 30, JSON.stringify(v));
  assert.ok(!v.allowed && /через 30 с/.test(v.reason), !v.allowed ? v.reason : "");
});

test("через минуту можно снова", () => {
  const now = new Date("2026-08-31T12:00:00Z");
  const v = canSendThrottledSms(
    { lastSentAt: new Date("2026-08-31T11:59:00Z"), sentToday: 1 },
    now,
  );
  assert.equal(v.allowed, true);
});

test("двадцать за сутки — потолок", () => {
  const давно = new Date("2026-08-31T10:00:00Z");
  const now = new Date("2026-08-31T12:00:00Z");
  // Пауза выдержана, но суточный лимит выбран.
  const v = canSendThrottledSms({ lastSentAt: давно, sentToday: SMS_DAILY_LIMIT }, now);
  assert.equal(v.allowed, false);
  assert.ok(!v.allowed && /за сутки/.test(v.reason));

  const ещё = canSendThrottledSms(
    { lastSentAt: давно, sentToday: SMS_DAILY_LIMIT - 1 },
    now,
  );
  assert.equal(ещё.allowed, true);
});

test("суточный лимит важнее паузы", () => {
  // Иначе сообщение об ошибке звало бы вернуться через минуту, а через минуту
  // ответ был бы тот же.
  const now = new Date("2026-08-31T12:00:00Z");
  const v = canSendThrottledSms(
    { lastSentAt: new Date("2026-08-31T11:59:59Z"), sentToday: SMS_DAILY_LIMIT },
    now,
  );
  assert.ok(!v.allowed && /за сутки/.test(v.reason), !v.allowed ? v.reason : "");
});
