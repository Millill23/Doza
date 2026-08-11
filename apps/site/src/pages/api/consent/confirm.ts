import type { APIRoute } from "astro";
import { confirmConsent } from "@doza/db/consent";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const res = await confirmConsent(token);
  return new Response(JSON.stringify(res), {
    status: res.ok ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
};
