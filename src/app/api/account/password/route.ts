import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessions, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clientIp, jsonError, readJsonBody } from "@/lib/security/request";
import { changePasswordSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Eigenes Passwort setzen oder aendern.
 *
 * Wer bisher nur einen Passkey hat, darf ohne altes Passwort eines
 * vergeben – die Sitzung selbst ist der Nachweis. Nach der Aenderung werden
 * alle Sitzungen verworfen und die aktuelle neu ausgestellt.
 */
export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = changePasswordSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Konto nicht gefunden.", 404);

  if (user.passwordHash) {
    const current = parsed.data.currentPassword ?? "";
    const valid = await verifyPassword(current, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        {
          error: "Das aktuelle Passwort stimmt nicht.",
          fields: { currentPassword: "Falsch" },
        },
        { status: 401 },
      );
    }
  }

  const weak = validatePasswordStrength(parsed.data.newPassword);
  if (weak) {
    return NextResponse.json({ error: weak, fields: { newPassword: weak } }, { status: 422 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  // Alle bestehenden Sitzungen entwerten und fuer dieses Geraet eine neue
  // ausstellen, damit der Wechsel nicht abmeldet.
  await destroyAllSessions(user.id);
  const session = await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip: clientIp(request),
  });

  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
