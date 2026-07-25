import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { createSession, destroyAllSessions, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/** Uebersicht der eigenen aktiven Sitzungen. */
export async function GET() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const sessions = await prisma.session.findMany({
    where: { userId: auth.user.id, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({ sessions });
}

/** Ueberall abmelden – das aktuelle Geraet bleibt angemeldet. */
export async function DELETE(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  await destroyAllSessions(auth.user.id);
  const session = await createSession(auth.user.id, {
    userAgent: request.headers.get("user-agent"),
    ip: clientIp(request),
  });

  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
