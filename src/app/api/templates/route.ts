import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { formatZodError, templateCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Hoechstzahl je Konto. Wer mehr braucht, hat keine Vorlagen mehr, sondern Projekte. */
const MAX_TEMPLATES = 30;

export async function GET() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const templates = await prisma.projectTemplate.findMany({
    where: { ownerId: auth.user.id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `mutate:${clientIp(request)}`,
    LIMITS.mutation.limit,
    LIMITS.mutation.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = templateCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const vorhanden = await prisma.projectTemplate.count({ where: { ownerId: auth.user.id } });
  if (vorhanden >= MAX_TEMPLATES) {
    return jsonError(`Mehr als ${MAX_TEMPLATES} Vorlagen sind nicht vorgesehen.`, 409);
  }

  const data = parsed.data;

  // Der Name ist je Konto eindeutig; ein Duplikat soll eine verstaendliche
  // Meldung geben statt eines Datenbankfehlers.
  const doppelt = await prisma.projectTemplate.findFirst({
    where: { ownerId: auth.user.id, name: data.name },
    select: { id: true },
  });
  if (doppelt) return jsonError(`Eine Vorlage „${data.name}“ gibt es bereits.`, 409);

  const template = await prisma.projectTemplate.create({
    data: {
      ownerId: auth.user.id,
      name: data.name,
      description: data.description ?? null,
      summary: data.summary ?? null,
      projectDescription: data.projectDescription ?? null,
      status: data.status,
      priority: data.priority,
      accent: data.accent,
      tags: data.tags,
      progressFromTasks: data.progressFromTasks,
      notes: data.notes,
      tasks: data.tasks,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
