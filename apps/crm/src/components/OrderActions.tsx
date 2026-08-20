"use client";

import { useState, useTransition } from "react";
import { changeOrderStatus, refundOrder, setTracking } from "@/lib/actions/orders";
import {
  ORDER_TRANSITIONS,
  requiresTracking,
  type OrderStatusValue,
  type DeliveryServiceValue,
} from "@doza/db/order-rules";
import { ORDER_STATUS_LABEL, DELIVERY_SERVICE_LABEL } from "@/lib/labels";

const SERVICES: DeliveryServiceValue[] = ["europochta", "belpochta"];

export default function OrderActions({
  orderId,
  status,
  tracking,
  deliveryType,
  deliveryService,
  paid,
  isAdmin,
}: {
  orderId: number;
  status: OrderStatusValue;
  tracking: string | null;
  deliveryType: "pickup" | "post";
  deliveryService: DeliveryServiceValue | null;
  paid: boolean;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [track, setTrack] = useState(tracking ?? "");
  const [service, setService] = useState<DeliveryServiceValue>(
    deliveryService ?? "europochta",
  );
  const [err, setErr] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");

  const next = (ORDER_TRANSITIONS[status] ?? []) as OrderStatusValue[];
  const shipping = next.some((s) => requiresTracking(s, deliveryType));
  const done = status === "refunded" || next.length === 0;

  function step(to: OrderStatusValue) {
    setErr(null);
    startTransition(async () => {
      try {
        await changeOrderStatus({
          orderId,
          next: to,
          trackingNumber: track,
          deliveryService: service,
        });
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function doRefund() {
    setErr(null);
    startTransition(async () => {
      try {
        await refundOrder(orderId, reason);
        setRefundOpen(false);
        setReason("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function saveTrack() {
    startTransition(async () => {
      try {
        await setTracking(orderId, track, service);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wide text-gold-500">
          Следующий шаг
        </h3>

        {!paid && status === "new" ? (
          <p className="text-sm text-red-300">
            Заказ не оплачен — в работу не берётся.
          </p>
        ) : done ? (
          <p className="text-sm text-ivory-faint">
            {status === "refunded"
              ? "Деньги возвращены, заказ закрыт."
              : "Заказ в финальном статусе."}
          </p>
        ) : (
          <>
            {/* Трек-номер спрашиваем до нажатия: без него отправку не примем,
                и лишний отказ на кнопке никому не нужен. */}
            {shipping && (
              <div className="mb-3 space-y-2">
                <div className="flex gap-2">
                  {SERVICES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setService(s)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        service === s
                          ? "border-gold-500 bg-gold-500/10 text-gold-300"
                          : "border-ink-600 text-ivory-muted hover:border-gold-600/50"
                      }`}
                    >
                      {DELIVERY_SERVICE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <input
                  value={track}
                  onChange={(e) => setTrack(e.target.value)}
                  placeholder="Трек-номер отправления"
                  className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
                />
                <p className="text-xs text-ivory-faint">
                  Покупателю уйдёт SMS со службой доставки и этим номером.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <button
                  key={s}
                  onClick={() => step(s)}
                  disabled={pending}
                  className="rounded-full bg-gold-gradient px-4 py-2 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {ORDER_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </>
        )}
        {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      </div>

      {/* Трек-номер уже отправленного заказа: почта иногда выдаёт новый номер
          при переупаковке. */}
      {status === "shipped" && deliveryType === "post" && (
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wide text-gold-500">
            Трек-номер
          </h3>
          <div className="flex gap-2">
            <input
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none"
            />
            <button
              onClick={saveTrack}
              disabled={pending}
              className="rounded-lg border border-gold-600/50 px-4 text-sm text-gold-400 transition-colors hover:border-gold-500 disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      {isAdmin && paid && status !== "refunded" && (
        <div className="border-t border-ink-600/60 pt-5">
          {!refundOpen ? (
            <button
              onClick={() => setRefundOpen(true)}
              className="w-full rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10"
            >
              Рефанд
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ivory-muted">
                Деньги вернутся покупателю на карту, баллы и остатки — в базу.
                Отменить это нельзя.
              </p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Причина возврата"
                className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-red-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={doRefund}
                  disabled={pending || reason.trim().length < 3}
                  className="flex-1 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? "Возвращаем…" : "Вернуть деньги"}
                </button>
                <button
                  onClick={() => setRefundOpen(false)}
                  className="rounded-lg border border-ink-600 px-4 text-sm text-ivory-muted"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
