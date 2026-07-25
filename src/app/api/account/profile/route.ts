import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/security/request";
import { formatZodError, profileUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = profileUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { displayName, email } = parsed.data;

  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, NOT: { id: auth.user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits verwendet.", fields: { email: "Bereits vergeben" } },
        { status: 409 },
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(email !== undefined ? { email } : {}),
    },
    select: { id: true, username: true, displayName: true, email: true, role: true },
  });

  return NextResponse.json({ user });
}
