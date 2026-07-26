import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { issueRecoveryCodes } from "@/lib/auth/recovery";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";

export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string().min(1).max(200) });

/**
 * Neue Wiederherstellungscodes. Die alten verfallen dabei – sonst waeren
 * Zettel im Umlauf, von denen niemand mehr weiss, welche noch gelten.
 *
 * Verlangt das Passwort, wie das Abschalten auch: die Codes sind gleichwertig
 * zum zweiten Faktor.
 */
export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return jsonError("Bitte das Passwort angeben.", 422);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: { passwordHash: true, totpEnabledAt: true },
  });

  if (!user.totpEnabledAt) {
    return jsonError("Die Zwei-Faktor-Anmeldung ist nicht aktiv.", 409);
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Das Passwort stimmt nicht.", 401);
  }

  return NextResponse.json({ recoveryCodes: await issueRecoveryCodes(auth.user.id) });
}
