import type {
  GitConnection,
  Note,
  Prisma,
  Project,
  RepoSnapshot,
  Repository,
  Task,
} from "@prisma/client";
import { APP_NAME } from "@/lib/config";
import { prisma } from "@/lib/db";
import { repoTitle } from "@/lib/repositories";
import { PRIORITY_META, statusOf } from "@/lib/status";
import { formatDate, formatDateTime } from "@/lib/utils";
import { EXPORT_KIND, EXPORT_VERSION, type ExportFile, type ExportedProject } from "./format";

export type RepositoryForExport = Repository & {
  connection: Pick<GitConnection, "name" | "provider" | "baseUrl"> | null;
};

export type ProjectForExport = Project & {
  notes: Note[];
  tasks: Task[];
  repositories: RepositoryForExport[];
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
    // Version 1 hatte ein autoSync am Projekt. Das Feld ist im Schema noch
    // vorhanden, damit alte Dateien lesbar bleiben; geschrieben wird der
    // Wert des fuehrenden Repositories, damit eine Version-2-Datei auch von
    // einer aelteren Instanz noch sinnvoll gelesen werden koennte.
    autoSync: project.repositories[0]?.autoSync ?? true,
    repositories: project.repositories.map((repository) => ({
      label: repository.label,
      repoUrl: repository.repoUrl,
      repoOwner: repository.repoOwner,
      repoName: repository.repoName,
      autoSync: repository.autoSync,
      connection: repository.connection
        ? {
            name: repository.connection.name,
            provider: repository.connection.provider,
            baseUrl: repository.connection.baseUrl,
          }
        : null,
    })),
    notes: project.notes.map((note) => ({
      title: note.title,
      content: note.content,
      pinned: note.pinned,
      createdAt: note.createdAt.toISOString(),
    })),
    tasks: project.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      status: task.status,
      position: task.position,
      dueDate: task.dueDate?.toISOString() ?? null,
      labels: task.labels,
      createdAt: task.createdAt.toISOString(),
    })),
    progressFromTasks: project.progressFromTasks,
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
    include: exportInclude,
    orderBy: { name: "asc" },
  });
}

/** Der Umfang, den der Export braucht – an beiden Aufrufstellen derselbe. */
export const exportInclude = {
  notes: { orderBy: [{ pinned: "desc" }, { createdAt: "asc" }] },
  tasks: { orderBy: [{ status: "asc" }, { position: "asc" }] },
  repositories: {
    include: { connection: { select: { name: true, provider: true, baseUrl: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.ProjectInclude;

// ── Markdown ─────────────────────────────────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  GITEA: "Gitea",
};

const TASK_LABEL: Record<string, string> = {
  TODO: "Offen",
  DOING: "In Arbeit",
  BLOCKED: "Blockiert",
  DONE: "Erledigt",
};

/**
 * Ein Projekt als lesbares Markdown – zum Archivieren oder als Grundlage
 * fuer ein README. Der Git-Stand kommt aus dem letzten Snapshot, damit die
 * Datei auch ohne Netz vollstaendig ist.
 */
export function toMarkdown(
  project: ProjectForExport & {
    repositories: Array<RepositoryForExport & { snapshot: RepoSnapshot | null }>;
  },
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
  lines.push("");

  if (project.description) {
    lines.push("## Beschreibung", "", project.description, "");
  }

  for (const repository of project.repositories) {
    const titel = repoTitle(repository);
    lines.push(
      project.repositories.length === 1
        ? "## Repository"
        : `## Repository: ${titel}`,
      "",
    );

    lines.push("| | |", "| --- | --- |");
    if (repository.repoUrl) lines.push(`| Adresse | ${repository.repoUrl} |`);
    if (repository.connection) {
      const label =
        PROVIDER_LABEL[repository.connection.provider] ?? repository.connection.provider;
      lines.push(`| Git-System | ${label} (${repository.connection.baseUrl}) |`);
    }

    const snapshot = repository.snapshot;
    if (snapshot) {
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
      lines.push(`| Abgerufen | ${formatDateTime(snapshot.fetchedAt)} |`);
    } else {
      lines.push("| Stand | noch nie abgeglichen |");
    }
    lines.push("");
  }

  if (project.tasks.length) {
    lines.push("## Aufgaben", "");
    for (const status of ["TODO", "DOING", "BLOCKED", "DONE"] as const) {
      const inColumn = project.tasks.filter((task) => task.status === status);
      if (!inColumn.length) continue;
      lines.push(`### ${TASK_LABEL[status]}`, "");
      for (const task of inColumn) {
        const box = status === "DONE" ? "[x]" : "[ ]";
        const due = task.dueDate ? ` _(faellig ${formatDate(task.dueDate)})_` : "";
        lines.push(`- ${box} ${task.title}${due}`);
      }
      lines.push("");
    }
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
