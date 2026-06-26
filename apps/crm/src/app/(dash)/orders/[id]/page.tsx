import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@doza/db";
import { formatByn, formatPhone } from "@doza/shared";
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, DELIVERY_LABEL } from "@/lib/labels";
import OrderActions from "@/components/OrderActions";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
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

  return (
    <div>
      <Link href="/orders" className="mb-6 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К списку заказов
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <h1 className="font-serif text-3xl text-ivory">Заказ #{order.id}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${ORDER_STATUS_STYLE[order.status]}`}>
          {ORDER_STATUS_LABEL[order.status]}
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
              {order.address && (
                <>
                  <dt className="text-ivory-faint">Адрес</dt>
                  <dd className="text-ivory">{order.address}</dd>
                </>
              )}
              {order.comment && (
                <>
                  <dt className="text-ivory-faint">Комментарий</dt>
                  <dd className="text-ivory">{order.comment}</dd>
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
            status={order.status}
            tracking={order.trackingNumber}
          />
        </div>
      </div>
    </div>
  );
}
