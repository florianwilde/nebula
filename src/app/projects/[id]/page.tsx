import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { GitPanel } from "@/components/GitPanel";
import { NotesPanel } from "@/components/NotesPanel";
import { ProjectHeader } from "@/components/ProjectHeader";
import { prisma } from "@/lib/db";
import { connectionSafeSelect, projectDetailInclude } from "@/lib/projects";
import type { ConnectionSafe, ProjectDetail } from "@/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true, summary: true },
  });
  return {
    title: project?.name ?? "Projekt",
    description: project?.summary ?? undefined,
  };
}

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params;

  const [project, connections] = await Promise.all([
    prisma.project.findUnique({ where: { id }, include: projectDetailInclude }),
    prisma.gitConnection.findMany({ select: connectionSafeSelect, orderBy: { name: "asc" } }),
  ]);

  if (!project) notFound();

  const detail = project as unknown as ProjectDetail;

  return (
    <div className="space-y-6 pt-4">
      <ProjectHeader
        project={detail}
        connections={connections as unknown as ConnectionSafe[]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <section className="glass p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
              <FileText className="h-4 w-4 text-cyan-300" />
              Beschreibung
            </h2>
            {detail.description ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                {detail.description}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Keine Beschreibung hinterlegt. Ueber „Bearbeiten“ kannst du die Idee ausformulieren.
              </p>
            )}
          </section>

          <NotesPanel projectId={detail.id} notes={detail.notes} />
        </div>

        <div className="lg:col-span-7">
          <GitPanel project={detail} />
        </div>
      </div>
    </div>
  );
}
