import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/git";
import { projectListInclude, uniqueSlug } from "@/lib/projects";
import { formatZodError, projectCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const query = searchParams.get("q");

  const projects = await prisma.project.findMany({
    where: {
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;

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
      name: data.name,
      slug: await uniqueSlug(data.name),
      summary: data.summary ?? null,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      progress: data.progress,
      accent: data.accent,
      tags: data.tags,
      favorite: data.favorite,
      repoUrl: data.repoUrl ?? null,
      repoOwner,
      repoName,
      connectionId: data.connectionId ?? null,
    },
    include: projectListInclude,
  });

  return NextResponse.json({ project }, { status: 201 });
}
