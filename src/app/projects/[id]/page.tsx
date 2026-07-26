import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { GitPanel } from "@/components/GitPanel";
import { Markdown } from "@/components/Markdown";
import { NotesPanel } from "@/components/NotesPanel";
import { ProjectHeader } from "@/components/ProjectHeader";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { requireUserPage } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { connectionSafeSelect, projectDetailInclude } from "@/lib/projects";
import type { ConnectionSafe, ProjectDetail } from "@/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const user = await getSessionUser();
  if (!user) return { title: "Projekt" };

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, ownerId: user.id },
    select: { name: true, summary: true },
  });
  return {
    title: project?.name ?? "Projekt",
    description: project?.summary ?? undefined,
  };
}

export default async function ProjectPage({ params }: PageProps) {
  const user = await requireUserPage();
  const { id } = await params;

  const [project, connections] = await Promise.all([
    // findFirst mit Besitzerbedingung: ein fremdes Projekt fuehrt zu 404,
    // nicht zu einer Fehlermeldung, die seine Existenz bestaetigt.
    prisma.project.findFirst({
      where: { id, ownerId: user.id },
      include: projectDetailInclude,
    }),
    prisma.gitConnection.findMany({
      where: { ownerId: user.id },
      select: connectionSafeSelect,
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) notFound();

  const detail = project as unknown as ProjectDetail;

  return (
    <div className="space-y-6 pt-4">
      <ProjectHeader
        project={detail}
        connections={connections as unknown as ConnectionSafe[]}
      />

      <TaskBoard
        projectId={detail.id}
        tasks={detail.tasks}
        progressFromTasks={detail.progressFromTasks}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <section className="glass p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
              <FileText className="h-4 w-4 text-cyan-300" />
              Beschreibung
            </h2>
            {detail.description ? (
              <Markdown className="mt-3">{detail.description}</Markdown>
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
