import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import {
  ORDER_STATUS_STYLE,
  DELIVERY_LABEL,
  DELIVERY_SERVICE_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/labels";
import { orderStatusLabel, type OrderStatusValue } from "@doza/db/order-rules";
import OrderActions from "@/components/OrderActions";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireRole(["admin", "seller"]);
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { include: { brand: true } } } },
    },
  });
  if (!order) notFound();

  const toPay = Number(order.totalByn) - Number(order.loyaltySpentByn);
  const paid = order.paymentStatus === "paid";

  return (
    <div>
      <Link href="/orders" className="mb-6 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К списку заказов
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <h1 className="font-serif text-3xl text-ivory">Заказ #{order.id}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${ORDER_STATUS_STYLE[order.status]}`}>
          {orderStatusLabel(order.status, order.deliveryType)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Клиент */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">Клиент</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-ivory-faint">Имя</dt>
              <dd className="text-ivory">{order.customerName}</dd>
              <dt className="text-ivory-faint">Телефон</dt>
              <dd className="text-ivory">{formatPhone(order.customerPhone)}</dd>
              <dt className="text-ivory-faint">Получение</dt>
              <dd className="text-ivory">{DELIVERY_LABEL[order.deliveryType]}</dd>
              <dt className="text-ivory-faint">Оплата</dt>
              <dd className={paid ? "text-green-300" : "text-red-300"}>
                {paid ? "Оплачен" : PAYMENT_STATUS_LABEL[order.paymentStatus]}
              </dd>
              {order.comment && (
                <>
                  <dt className="text-ivory-faint">Комментарий</dt>
                  <dd className="text-ivory">{order.comment}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Данные посылки — их заполняет покупатель при оформлении, и именно
              они попадают на бланк отправления. */}
          {order.deliveryType === "post" && (
            <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
              <h2 className="mb-4 font-serif text-xl text-ivory">Доставка</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-ivory-faint">Получатель</dt>
                <dd className="text-ivory">
                  {[
                    order.recipientLastName,
                    order.recipientFirstName,
                    order.recipientMiddleName,
                  ]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </dd>
                <dt className="text-ivory-faint">Индекс</dt>
                <dd className="text-ivory">{order.postalCode ?? "—"}</dd>
                <dt className="text-ivory-faint">Область</dt>
                <dd className="text-ivory">{order.region ?? "—"}</dd>
                <dt className="text-ivory-faint">Город</dt>
                <dd className="text-ivory">{order.city ?? "—"}</dd>
                <dt className="text-ivory-faint">Адрес</dt>
                <dd className="text-ivory">{order.address ?? "—"}</dd>
                {order.deliveryService && (
                  <>
                    <dt className="text-ivory-faint">Служба</dt>
                    <dd className="text-ivory">
                      {DELIVERY_SERVICE_LABEL[order.deliveryService]}
                    </dd>
                  </>
                )}
                {order.trackingNumber && (
                  <>
                    <dt className="text-ivory-faint">Трек-номер</dt>
                    <dd className="text-gold-400">{order.trackingNumber}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Состав */}
          <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
            <h2 className="mb-4 font-serif text-xl text-ivory">Состав</h2>
            <ul className="divide-y divide-ink-600/40">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-ivory">
                    {i.product.brand.name} — {i.product.name}, {i.volumeMl} мл × {i.qty}
                  </span>
                  <span className="text-gold-400">{formatByn(Number(i.priceByn) * i.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1.5 border-t border-ink-600/60 pt-4 text-sm">
              <div className="flex justify-between text-ivory-muted">
                <span>Сумма</span>
                <span>{formatByn(Number(order.totalByn))}</span>
              </div>
              {Number(order.loyaltySpentByn) > 0 && (
                <div className="flex justify-between text-botanical-300">
                  <span>Списано баллов</span>
                  <span>−{formatByn(Number(order.loyaltySpentByn))}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-medium text-ivory">
                <span>К оплате</span>
                <span className="text-gold-gradient">{formatByn(toPay)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6 lg:sticky lg:top-8 lg:self-start">
          <OrderActions
            orderId={order.id}
            status={order.status as OrderStatusValue}
            tracking={order.trackingNumber}
            deliveryType={order.deliveryType}
            deliveryService={order.deliveryService}
            paid={paid}
            isAdmin={session.user.role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}
