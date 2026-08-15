import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guard";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { getInstanceState } from "@/lib/auth/settings";
import { userSafeSelect } from "@/lib/auth/users";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { adminUserCreateSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    select: userSafeSelect,
    orderBy: [{ role: "asc" }, { username: "asc" }],
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const state = await getInstanceState();
  if (!state.multiUser) {
    return jsonError(
      "Im Einzelbetrieb kann kein weiteres Konto angelegt werden. " +
        "Bitte zuerst in den Mehrbenutzerbetrieb wechseln.",
      409,
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = adminUserCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { username, displayName, email, password, role } = parsed.data;

  const weak = validatePasswordStrength(password, username);
  if (weak) {
    return NextResponse.json({ error: weak, fields: { password: weak } }, { status: 422 });
  }

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken) {
    return NextResponse.json(
      { error: "Dieser Benutzername ist bereits vergeben.", fields: { username: "Bereits vergeben" } },
      { status: 409 },
    );
  }

  if (email) {
    const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits verwendet.", fields: { email: "Bereits vergeben" } },
        { status: 409 },
      );
    }
  }

  const user = await prisma.user.create({
    data: {
      username,
      displayName: displayName ?? null,
      email: email ?? null,
      passwordHash: await hashPassword(password),
      role,
    },
    select: userSafeSelect,
  });

  return NextResponse.json({ user }, { status: 201 });
}
