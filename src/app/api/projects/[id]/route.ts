import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/git";
import { projectDetailInclude, projectListInclude, uniqueSlug } from "@/lib/projects";
import { formatZodError, projectUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });

  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};

  if (data.name !== undefined && data.name !== existing.name) {
    update.name = data.name;
    update.slug = await uniqueSlug(data.name, id);
  }
  for (const key of ["summary", "description", "status", "priority", "progress", "accent", "tags", "favorite", "connectionId"] as const) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  if (data.repoUrl !== undefined) {
    update.repoUrl = data.repoUrl;
    const parsedUrl = data.repoUrl ? parseRepoUrl(data.repoUrl) : null;
    if (parsedUrl) {
      update.repoOwner = data.repoOwner ?? parsedUrl.owner;
      update.repoName = data.repoName ?? parsedUrl.name;
    } else if (!data.repoUrl) {
      update.repoOwner = null;
      update.repoName = null;
    }
  }
  if (data.repoOwner !== undefined) update.repoOwner = data.repoOwner;
  if (data.repoName !== undefined) update.repoName = data.repoName;

  const project = await prisma.project.update({
    where: { id },
    data: update,
    include: projectListInclude,
  });

  return NextResponse.json({ project });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }
}
