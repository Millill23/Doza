import type { APIRoute } from "astro";
import { clearSession } from "../../../lib/customer-auth";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  clearSession(cookies);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
