import {
  fetchCheckoutStatus,
  paymentOutcome,
  canAcceptPayment,
  toMinorUnits,
  bepaidConfig,
} from "@doza/shared/bepaid";
import {
  applyPaymentResult,
  orderByPaymentToken,
  type ApplyResult,
} from "@doza/db/payments";
import { onOrderPaid } from "./order-paid";

/**
 * Проверить платёж у шлюза и применить результат к заказу.
 *
 * Единственный путь, которым заказ становится оплаченным. И вебхук, и возврат
 * покупателя на сайт зовут именно эту функцию: уведомление bePaid ничем не
 * подписано, а `status` в адресе возврата покупатель может поправить руками —
 * поэтому оба события служат лишь поводом сходить за настоящим статусом.
 */
export async function verifyAndApply(token: string): Promise<ApplyResult | null> {
  if (!token) return null;

  const order = await orderByPaymentToken(token);
  if (!order) return null;

  const cfg = bepaidConfig();
  const status = await fetchCheckoutStatus(token, cfg);
  const outcome = paymentOutcome(status);

  // Доставка входит в сумму платежа наравне с товарами: покупателю выставили
  // счёт с ней, столько же должно прийти от шлюза.
  const expectedMinor = toMinorUnits(
    Math.round(
      (Number(order.totalByn) +
        Number(order.deliveryFeeByn) -
        Number(order.loyaltySpentByn)) *
        100,
    ) / 100,
  );
  const verdict = canAcceptPayment({
    outcome,
    isTest: status.test,
    // Тестовые транзакции засчитываем, только когда магазин сам работает в
    // тестовом режиме. Иначе тестовым платежом можно получить товар даром.
    allowTest: cfg.test,
    paidMinor: status.paidMinor,
    expectedMinor,
  });

  const result = await applyPaymentResult({
    token,
    uid: status.uid,
    outcome,
    isTest: status.test,
    message: status.message,
    accepted: verdict.ok,
    rejectReason: verdict.ok ? undefined : verdict.reason,
  });

  // Всё, что происходит с оплатой, делается ровно один раз — на переходе
  // заказа в оплаченный. `justPaid` выставляется условным UPDATE, поэтому
  // повторные уведомления bePaid сюда не попадают.
  if (result?.justPaid) {
    await onOrderPaid(
      result.orderId,
      status.test ? "ТЕСТОВЫЙ платёж" : "картой",
    );
  }

  return result;
}
