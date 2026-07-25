import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { projectDetailInclude } from "@/lib/projects";
import { syncProject } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Holt Branches, Tags, Commits und Releases beim Git-System ab. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await syncProject(id);

  const project = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });

  return NextResponse.json({ ...result, project }, { status: result.ok ? 200 : 502 });
}
