import type { APIRoute } from "astro";
import { prisma } from "@doza/db";
import { getBalance, getNextExpiry } from "@doza/db/loyalty";
import { normalizePhone } from "@doza/shared";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const phoneRaw = url.searchParams.get("phone") ?? "";
  const phone = normalizePhone(phoneRaw);

  if (phone.length < 9) {
    return new Response(JSON.stringify({ found: false, balance: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });

  if (!customer) {
    return new Response(JSON.stringify({ found: false, balance: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const [balance, nextExpiry] = await Promise.all([
    getBalance(customer.id),
    getNextExpiry(customer.id),
  ]);

  return new Response(
    JSON.stringify({
      found: true,
      name: customer.name,
      balance,
      nextExpiry: nextExpiry?.toISOString() ?? null,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
