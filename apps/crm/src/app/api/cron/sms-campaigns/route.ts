import { NextResponse } from "next/server";
import { checkCronKey } from "@/lib/cron-auth";
import { processSmsCampaigns } from "@/lib/sms-campaigns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = checkCronKey(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, processed: await processSmsCampaigns() });
}
