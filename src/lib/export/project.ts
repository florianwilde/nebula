import type { GitConnection, Note, Project, RepoSnapshot } from "@prisma/client";
import { APP_NAME } from "@/lib/config";
import { prisma } from "@/lib/db";
import { PRIORITY_META, statusOf } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";
import { EXPORT_KIND, EXPORT_VERSION, type ExportFile, type ExportedProject } from "./format";

type ProjectForExport = Project & {
  notes: Note[];
  connection: Pick<GitConnection, "name" | "provider" | "baseUrl"> | null;
};

/** Formt einen Datensatz in das Austauschformat um – ohne Geheimnisse. */
export function toExportedProject(project: ProjectForExport): ExportedProject {
  return {
    name: project.name,
    slug: project.slug,
    summary: project.summary,
    description: project.description,
    status: project.status,
    priority: project.priority,
    progress: project.progress,
    accent: project.accent,
    tags: project.tags,
    favorite: project.favorite,
    autoSync: project.autoSync,
    repoUrl: project.repoUrl,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    connection: project.connection
      ? {
          name: project.connection.name,
          provider: project.connection.provider,
          baseUrl: project.connection.baseUrl,
        }
      : null,
    notes: project.notes.map((note) => ({
      title: note.title,
      content: note.content,
      pinned: note.pinned,
      createdAt: note.createdAt.toISOString(),
    })),
    createdAt: project.createdAt.toISOString(),
  };
}

export function buildExportFile(projects: ProjectForExport[]): ExportFile {
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: APP_NAME,
    projects: projects.map(toExportedProject),
  };
}

/** Laedt die Projekte eines Kontos im fuer den Export noetigen Umfang. */
export async function loadProjectsForExport(
  ownerId: string,
  projectId?: string,
): Promise<ProjectForExport[]> {
  return prisma.project.findMany({
    where: { ownerId, ...(projectId ? { id: projectId } : {}) },
    include: {
      notes: { orderBy: [{ pinned: "desc" }, { createdAt: "asc" }] },
      connection: { select: { name: true, provider: true, baseUrl: true } },
    },
    orderBy: { name: "asc" },
  });
}

// ── Markdown ─────────────────────────────────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  GITEA: "Gitea",
};

/**
 * Ein Projekt als lesbares Markdown – zum Archivieren oder als Grundlage
 * fuer ein README. Der Git-Stand kommt aus dem letzten Snapshot, damit die
 * Datei auch ohne Netz vollstaendig ist.
 */
export function toMarkdown(
  project: ProjectForExport & { snapshot: RepoSnapshot | null },
): string {
  const status = statusOf(project.status);
  const priority = PRIORITY_META[project.priority] ?? PRIORITY_META[2];
  const lines: string[] = [];

  lines.push(`# ${project.name}`, "");
  if (project.summary) lines.push(`> ${project.summary}`, "");

  lines.push("| | |", "| --- | --- |");
  lines.push(`| Status | ${status.label} |`);
  lines.push(`| Fortschritt | ${project.progress} % |`);
  lines.push(`| Prioritaet | ${priority.label} |`);
  if (project.tags.length) {
    lines.push(`| Tags | ${project.tags.map((tag) => `\`${tag}\``).join(", ")} |`);
  }
  lines.push(`| Angelegt | ${formatDateTime(project.createdAt)} |`);
  if (project.repoUrl) lines.push(`| Repository | ${project.repoUrl} |`);
  if (project.connection) {
    const label = PROVIDER_LABEL[project.connection.provider] ?? project.connection.provider;
    lines.push(`| Git-System | ${label} (${project.connection.baseUrl}) |`);
  }
  lines.push("");

  if (project.description) {
    lines.push("## Beschreibung", "", project.description, "");
  }

  const snapshot = project.snapshot;
  if (snapshot) {
    lines.push("## Stand des Repositories", "");
    lines.push(`Abgerufen am ${formatDateTime(snapshot.fetchedAt)}.`, "");
    lines.push("| | |", "| --- | --- |");
    if (snapshot.defaultBranch) lines.push(`| Default-Branch | \`${snapshot.defaultBranch}\` |`);
    if (snapshot.latestTag) lines.push(`| Neuester Tag | \`${snapshot.latestTag}\` |`);
    lines.push(`| Branches | ${snapshot.branchCount} |`);
    lines.push(`| Tags | ${snapshot.tagCount} |`);
    lines.push(`| Offene PRs/MRs | ${snapshot.openPullRequests} |`);
    lines.push(`| Offene Issues | ${snapshot.openIssues} |`);
    if (snapshot.lastCommitSha) {
      lines.push(
        `| Letzter Commit | \`${snapshot.lastCommitSha.slice(0, 7)}\` – ` +
          `${snapshot.lastCommitMessage ?? ""} |`,
      );
    }
    lines.push("");
  }

  if (project.notes.length) {
    lines.push("## Notizen", "");
    for (const note of project.notes) {
      const pin = note.pinned ? " 📌" : "";
      lines.push(`### ${note.title ?? "Ohne Titel"}${pin}`, "");
      lines.push(note.content, "");
      lines.push(`<sub>${formatDateTime(note.createdAt)}</sub>`, "");
    }
  }

  lines.push("---", "");
  lines.push(`<sub>Exportiert aus ${APP_NAME} am ${formatDateTime(new Date())}.</sub>`, "");

  return lines.join("\n");
}
