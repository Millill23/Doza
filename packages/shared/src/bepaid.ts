/**
 * Клиент bePaid: создание платёжной страницы и проверка статуса.
 *
 * Выбрана именно платёжная страница провайдера, а не виджет на своём сайте:
 * реквизиты карты вводятся на стороне bePaid и через наш сервер не проходят,
 * поэтому требования PCI DSS к нам не применяются.
 *
 * Правила сумм и трактовка статусов — в `bepaid-rules.ts`.
 */

import { toMinorUnits, type GatewayState } from "./bepaid-rules";

export * from "./bepaid-rules";

const CHECKOUT_URL = "https://checkout.bepaid.by/ctp/api/checkouts";

export interface BepaidConfig {
  shopId: string;
  secretKey: string;
  /** Проводить транзакции в тестовом режиме. */
  test: boolean;
}

/** Настройки из окружения. Бросает, если магазин не настроен. */
export function bepaidConfig(): BepaidConfig {
  const shopId = process.env.BEPAID_SHOP_ID;
  const secretKey = process.env.BEPAID_SECRET_KEY;
  if (!shopId || !secretKey)
    throw new Error("Оплата не настроена: не заданы BEPAID_SHOP_ID и BEPAID_SECRET_KEY");
  return {
    shopId,
    secretKey,
    // Боевой режим — по умолчанию: забытая переменная не должна привести к
    // тому, что настоящие заказы оплачиваются тестовыми транзакциями.
    test: process.env.BEPAID_TEST === "1",
  };
}

/** Настроена ли оплата (чтобы не падать на страницах, где это не критично). */
export function isBepaidConfigured(): boolean {
  return Boolean(process.env.BEPAID_SHOP_ID && process.env.BEPAID_SECRET_KEY);
}

function authHeader(cfg: BepaidConfig): string {
  const raw = `${cfg.shopId}:${cfg.secretKey}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export interface CartPosition {
  name: string;
  /** Цена единицы в рублях. */
  priceByn: number;
  quantity: number;
}

export interface CreateCheckoutInput {
  /** Сумма к оплате в рублях. */
  amountByn: number;
  description: string;
  /** Номер заказа в нашей системе — вернётся в уведомлении. */
  trackingId: string;
  customer?: { firstName?: string; phone?: string; email?: string };
  positions?: CartPosition[];
  successUrl: string;
  declineUrl: string;
  failUrl: string;
  cancelUrl: string;
  notificationUrl: string;
  /** До какого момента можно оплатить. */
  expiredAt?: Date;
}

export interface CreateCheckoutResult {
  token: string;
  redirectUrl: string;
}

/**
 * Создать платёжную страницу и получить ссылку для покупателя.
 *
 * Способы оплаты ограничены картами: ЕРИП требует кода услуги и формата
 * лицевого счёта, которых у нас пока нет, — подключим отдельно.
 */
export async function createCardCheckout(
  input: CreateCheckoutInput,
  cfg = bepaidConfig(),
): Promise<CreateCheckoutResult> {
  const body = {
    checkout: {
      transaction_type: "payment",
      test: cfg.test,
      attempts: 3,
      order: {
        amount: toMinorUnits(input.amountByn),
        currency: "BYN",
        description: input.description,
        tracking_id: input.trackingId,
        ...(input.expiredAt ? { expired_at: input.expiredAt.toISOString() } : {}),
      },
      settings: {
        success_url: input.successUrl,
        decline_url: input.declineUrl,
        fail_url: input.failUrl,
        cancel_url: input.cancelUrl,
        notification_url: input.notificationUrl,
        language: "ru",
      },
      payment_method: { types: ["credit_card"] },
      ...(input.customer
        ? {
            customer: {
              first_name: input.customer.firstName,
              phone: input.customer.phone,
              email: input.customer.email,
            },
          }
        : {}),
      ...(input.positions?.length
        ? {
            order_extra: undefined,
            cart: {
              positions: input.positions.map((p) => ({
                name: p.name,
                amount: toMinorUnits(p.priceByn),
                quantity: p.quantity,
                description: p.name,
              })),
            },
          }
        : {}),
    },
  };

  const res = await fetch(CHECKOUT_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Version": "2",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as
    | { checkout?: { token?: string; redirect_url?: string }; message?: string; errors?: unknown }
    | null;

  const token = data?.checkout?.token;
  const redirectUrl = data?.checkout?.redirect_url;
  if (!res.ok || !token || !redirectUrl) {
    const detail =
      data?.message ??
      (data?.errors ? JSON.stringify(data.errors) : `HTTP ${res.status}`);
    throw new Error(`bePaid не создал платёж: ${detail}`);
  }

  return { token, redirectUrl };
}

export interface CheckoutStatus extends GatewayState {
  /** Транзакция помечена шлюзом как тестовая. */
  test: boolean;
  /** Оплаченная сумма в копейках. */
  paidMinor: number;
  uid: string | null;
  message: string | null;
  trackingId: string | null;
}

/**
 * Узнать настоящий статус платежа у шлюза.
 *
 * Единственный источник правды об оплате. Уведомления bePaid ничем не
 * подписаны, а параметр `status` в адресе возврата покупатель может
 * поправить руками — поэтому и то и другое служит лишь поводом сходить сюда.
 */
export async function fetchCheckoutStatus(
  token: string,
  cfg = bepaidConfig(),
): Promise<CheckoutStatus> {
  const res = await fetch(`${CHECKOUT_URL}/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: {
      Authorization: authHeader(cfg),
      Accept: "application/json",
      "X-API-Version": "2",
    },
  });

  if (!res.ok) throw new Error(`bePaid не ответил на запрос статуса: HTTP ${res.status}`);

  const data = (await res.json()) as {
    checkout?: {
      status?: string;
      finished?: boolean;
      expired?: boolean;
      test?: boolean;
      message?: string;
      order?: { amount?: number; tracking_id?: string };
      gateway_response?: {
        payment?: { uid?: string; amount?: number; status?: string };
        authorization?: { uid?: string; amount?: number; status?: string };
      };
    };
  };

  const c = data.checkout ?? {};
  const gw = c.gateway_response?.payment ?? c.gateway_response?.authorization;

  return {
    status: gw?.status ?? c.status ?? null,
    finished: c.finished ?? null,
    expired: c.expired ?? null,
    test: c.test === true,
    // Сумму берём из ответа шлюза: именно она реально списана. Если её нет,
    // падаем на сумму заказа из токена.
    paidMinor: gw?.amount ?? c.order?.amount ?? 0,
    uid: gw?.uid ?? null,
    message: c.message ?? null,
    trackingId: c.order?.tracking_id ?? null,
  };
}
