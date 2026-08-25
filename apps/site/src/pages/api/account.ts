import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { getBalance, getNextExpiry } from "@doza/db/loyalty";
import { normalizePhone } from "@doza/shared";

export const prerender = false;

import { orderStatusPublicLabel } from "@doza/db/order-rules";

export const GET: APIRoute = async ({ url }) => {
  const phone = normalizePhone(url.searchParams.get("phone") ?? "");

  const empty = { found: false };
  if (phone.length < 9) {
    return new Response(JSON.stringify(empty), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });
  if (!customer) {
    return new Response(JSON.stringify(empty), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const [balance, nextExpiry, batches, orders] = await Promise.all([
    getBalance(customer.id),
    getNextExpiry(customer.id),
    prisma.loyaltyBatch.findMany({
      where: {
        customerId: customer.id,
        amountByn: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { expiresAt: "asc" },
      select: { amountByn: true, expiresAt: true },
    }),
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, totalByn: true, status: true, deliveryType: true },
    }),
  ]);

  return new Response(
    JSON.stringify({
      found: true,
      name: customer.name,
      balance,
      nextExpiry: nextExpiry?.toISOString() ?? null,
      batches: batches.map((b) => ({
        amount: Number(b.amountByn),
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        date: o.createdAt.toISOString(),
        total: Number(o.totalByn),
        status: orderStatusPublicLabel(o.status, o.deliveryType),
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
