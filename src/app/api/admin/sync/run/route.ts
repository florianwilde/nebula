import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guard";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";
import { isAutoSyncRunning, runAutoSyncPass } from "@/lib/sync/scheduler";

export const dynamic = "force-dynamic";

/**
 * Stoesst einen Abgleich sofort an – unabhaengig vom Zeitplan.
 *
 * Dient zwei Zwecken: dem Knopf "Jetzt abgleichen" im Adminbereich und
 * einem externen Zeitgeber, falls jemand lieber von aussen taktet als den
 * eingebauten Automatismus zu nutzen.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `sync-run:${clientIp(request)}`,
    LIMITS.outbound.limit,
    LIMITS.outbound.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  if (isAutoSyncRunning()) {
    return jsonError("Es laeuft bereits ein Abgleich.", 409);
  }

  const report = await runAutoSyncPass("manuell");
  if (!report) {
    return jsonError("Es laeuft bereits ein Abgleich.", 409);
  }

  return NextResponse.json({ report });
}
