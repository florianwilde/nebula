import { CircleDot, GitBranch, Lightbulb, Rocket, Trophy } from "lucide-react";
import { ProjectBoard } from "@/components/ProjectBoard";
import { StatCard } from "@/components/StatCard";
import { requireUserPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { connectionSafeSelect, projectListInclude } from "@/lib/projects";
import { STATUS_META } from "@/lib/status";
import type { ConnectionSafe, ProjectListItem } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUserPage();

  const [projects, connections] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.id },
      include: projectListInclude,
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.gitConnection.findMany({
      where: { ownerId: user.id },
      select: connectionSafeSelect,
      orderBy: { name: "asc" },
    }),
  ]);

  const active = projects.filter((project) => project.status !== "ARCHIVED");
  const ideas = active.filter((project) => project.status === "IDEA").length;
  const inDev = active.filter((project) => project.status === "IN_DEVELOPMENT").length;
  const done = active.filter((project) => project.status === "DONE").length;
  const linked = active.filter((project) => Boolean(project.repoOwner && project.repoName)).length;

  const averageProgress =
    active.length > 0
      ? Math.round(active.reduce((sum, project) => sum + project.progress, 0) / active.length)
      : 0;

  return (
    <div className="space-y-6">
      <header className="fade-up pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-300/70">
          Vibe Coding Kontrollzentrum
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Deine Projekte auf{" "}
          <span className="text-gradient">einen Blick</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Ideen festhalten, Status pflegen, Notizen sammeln – und live sehen, was in den
          verknuepften Repositories bei GitHub, GitLab und Gitea passiert.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Projekte"
          value={active.length}
          hint={`Ø Fortschritt ${averageProgress}%`}
          icon={CircleDot}
          color="#a78bfa"
        />
        <StatCard
          label="Ideen"
          value={ideas}
          // Kurzer Hinweis statt der langen Statusbeschreibung – die wurde in
          // der schmalen Kachel mitten im Wort abgeschnitten.
          hint="Noch nichts gebaut"
          icon={Lightbulb}
          color={STATUS_META.IDEA.color}
        />
        <StatCard
          label="In Entwicklung"
          value={inDev}
          hint="Aktiv in Arbeit"
          icon={Rocket}
          color={STATUS_META.IN_DEVELOPMENT.color}
        />
        <StatCard
          label="Fertig"
          value={done}
          hint="Ausgeliefert"
          icon={Trophy}
          color={STATUS_META.DONE.color}
        />
        <StatCard
          label="Repos verknuepft"
          value={linked}
          hint={`${connections.length} Git-Verbindung${connections.length === 1 ? "" : "en"}`}
          icon={GitBranch}
          color="#38bdf8"
        />
      </div>

      <ProjectBoard
        projects={projects as unknown as ProjectListItem[]}
        connections={connections as unknown as ConnectionSafe[]}
      />
    </div>
  );
}
