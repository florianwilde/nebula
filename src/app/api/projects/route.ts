import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/git";
import { projectListInclude, uniqueSlug } from "@/lib/projects";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { formatZodError, projectCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const query = searchParams.get("q");

  const projects = await prisma.project.findMany({
    where: {
      // Die Besitzerbedingung steht immer zuerst und ist nicht optional.
      ownerId: auth.user.id,
      ...(status ? { status: status as never } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { summary: { contains: query, mode: "insensitive" as const } },
              { tags: { has: query.toLowerCase() } },
            ],
          }
        : {}),
    },
    include: projectListInclude,
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ projects });
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

  const parsed = projectCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Eine fremde Verbindung darf nicht untergeschoben werden.
  if (data.connectionId) {
    const connection = await prisma.gitConnection.findFirst({
      where: { id: data.connectionId, ownerId: auth.user.id },
      select: { id: true },
    });
    if (!connection) return jsonError("Git-Verbindung nicht gefunden.", 404);
  }

  // Owner/Name aus der URL ableiten, falls nicht explizit angegeben.
  let repoOwner = data.repoOwner ?? null;
  let repoName = data.repoName ?? null;
  if (data.repoUrl && (!repoOwner || !repoName)) {
    const parsedUrl = parseRepoUrl(data.repoUrl);
    if (parsedUrl) {
      repoOwner = repoOwner ?? parsedUrl.owner;
      repoName = repoName ?? parsedUrl.name;
    }
  }

  const project = await prisma.project.create({
    data: {
      ownerId: auth.user.id,
      name: data.name,
      slug: await uniqueSlug(data.name, auth.user.id),
      summary: data.summary ?? null,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      progress: data.progress,
      accent: data.accent,
      tags: data.tags,
      favorite: data.favorite,
      autoSync: data.autoSync,
      repoUrl: data.repoUrl ?? null,
      repoOwner,
      repoName,
      connectionId: data.connectionId ?? null,
    },
    include: projectListInclude,
  });

  return NextResponse.json({ project }, { status: 201 });
}
