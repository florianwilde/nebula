import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guard";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { destroyAllSessions } from "@/lib/auth/session";
import { userSafeSelect } from "@/lib/auth/users";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { adminUserUpdateSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Verhindert, dass sich die Instanz ohne Administrator wiederfindet. */
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (target?.role !== "ADMIN") return false;

  const activeAdmins = await prisma.user.count({
    where: { role: "ADMIN", isActive: true, NOT: { id: userId } },
  });
  return activeAdmins === 0;
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = adminUserUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return jsonError("Konto nicht gefunden.", 404);

  const { displayName, email, role, isActive, password } = parsed.data;

  const losesAdmin = (role && role !== "ADMIN") || isActive === false;
  if (losesAdmin && (await wouldRemoveLastAdmin(id))) {
    return jsonError(
      "Das ist der letzte aktive Administrator – Rolle und Status koennen nicht geaendert werden.",
      409,
    );
  }

  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, NOT: { id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits verwendet.", fields: { email: "Bereits vergeben" } },
        { status: 409 },
      );
    }
  }

  if (password) {
    const weak = validatePasswordStrength(password, target.username);
    if (weak) {
      return NextResponse.json({ error: weak, fields: { password: weak } }, { status: 422 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      // Ein Eingriff des Administrators hebt eine Sperre auf.
      ...(isActive === true ? { lockedUntil: null, failedLoginCount: 0 } : {}),
    },
    select: userSafeSelect,
  });

  // Deaktivieren oder ein neues Passwort beenden alle Sitzungen des Kontos.
  if (isActive === false || password) {
    await destroyAllSessions(id);
  }

  return NextResponse.json({ user });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (id === auth.user.id) {
    return jsonError("Das eigene Konto kann nicht geloescht werden.", 409);
  }
  if (await wouldRemoveLastAdmin(id)) {
    return jsonError("Der letzte aktive Administrator kann nicht geloescht werden.", 409);
  }

  try {
    // Projekte, Verbindungen, Passkeys und Sitzungen haengen per
    // onDelete: Cascade daran und verschwinden mit.
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Konto nicht gefunden.", 404);
  }
}
