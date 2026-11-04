import { z } from "zod";

/**
 * Austauschformat fuer Projekte.
 *
 * Bewusst schlank und ohne Geheimnisse:
 *  - keine Access Tokens. Die Verbindung wird nur beschrieben (Name, System,
 *    Basis-URL), das Token muss beim Import neu hinterlegt werden. Eine
 *    Exportdatei landet sonst schnell in einem Download-Ordner oder einem
 *    Cloud-Abgleich.
 *  - keine Repo-Snapshots. Die sind reproduzierbar und blaehen die Datei auf;
 *    ein Abgleich nach dem Import holt sie zurueck.
 *  - keine Datenbank-IDs. Die gelten nur in der Instanz, aus der exportiert
 *    wurde.
 *  - kein Verlauf. Er beschreibt, was in *dieser* Instanz passiert ist, und
 *    verwiese nach dem Import auf Konten, die es dort nicht gibt. Der Import
 *    setzt stattdessen einen eigenen ersten Eintrag.
 */

export const EXPORT_KIND = "nebula.projects";
/**
 * 2 seit den mehreren Repositories je Projekt. Dateien der Version 1 werden
 * weiter gelesen: ihre einzelnen Repo-Felder werden zum ersten Repository.
 */
export const EXPORT_VERSION = 2;

const STATUS = ["IDEA", "OPEN", "PLANNING", "IN_DEVELOPMENT", "DONE", "ARCHIVED"] as const;
const PROVIDERS = ["GITHUB", "GITLAB", "GITEA"] as const;

export const exportedNoteSchema = z.object({
  title: z.string().max(160).nullable().optional(),
  content: z.string().max(20000),
  pinned: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
});

export const exportedTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["TODO", "DOING", "BLOCKED", "DONE"]).optional().default("TODO"),
  position: z.number().int().min(0).optional().default(0),
  dueDate: z.string().nullable().optional(),
  labels: z.array(z.string().max(30)).max(8).optional().default([]),
  createdAt: z.string().optional(),
});

export const exportedConnectionSchema = z.object({
  name: z.string().max(80),
  provider: z.enum(PROVIDERS),
  baseUrl: z.string().max(300),
});

export const exportedRepositorySchema = z.object({
  label: z.string().max(80).nullable().optional(),
  repoUrl: z.string().max(500).nullable().optional(),
  repoOwner: z.string().max(200).nullable().optional(),
  repoName: z.string().max(200).nullable().optional(),
  autoSync: z.boolean().optional().default(true),
  /** Nur zur Wiedererkennung – ohne Token. */
  connection: exportedConnectionSchema.nullable().optional(),
});

export const exportedProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(60).optional(),
  summary: z.string().max(280).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  status: z.enum(STATUS).optional().default("IDEA"),
  priority: z.number().int().min(1).max(4).optional().default(2),
  progress: z.number().int().min(0).max(100).optional().default(0),
  accent: z.string().max(20).optional().default("violet"),
  tags: z.array(z.string().max(30)).max(12).optional().default([]),
  favorite: z.boolean().optional().default(false),
  /** Seit Version 2. */
  repositories: z.array(exportedRepositorySchema).max(20).optional(),
  /**
   * Version 1 kannte genau ein Repository und schrieb es flach ans Projekt.
   * Die Felder bleiben lesbar, damit aeltere Dateien weiter importierbar
   * sind; geschrieben werden sie nicht mehr.
   */
  autoSync: z.boolean().optional().default(true),
  repoUrl: z.string().max(500).nullable().optional(),
  repoOwner: z.string().max(200).nullable().optional(),
  repoName: z.string().max(200).nullable().optional(),
  connection: exportedConnectionSchema.nullable().optional(),
  notes: z.array(exportedNoteSchema).max(500).optional().default([]),
  tasks: z.array(exportedTaskSchema).max(1000).optional().default([]),
  progressFromTasks: z.boolean().optional().default(false),
  autoImportIssues: z.boolean().optional().default(false),
  autoCreateIssues: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
});

export const exportFileSchema = z.object({
  kind: z.literal(EXPORT_KIND),
  version: z.number().int().min(1).max(EXPORT_VERSION),
  exportedAt: z.string().optional(),
  app: z.string().optional(),
  projects: z.array(exportedProjectSchema).min(1).max(1000),
});

export type ExportedProject = z.infer<typeof exportedProjectSchema>;
export type ExportedRepository = z.infer<typeof exportedRepositorySchema>;

/**
 * Die Repositories einer Exportdatei – gleich, ob sie aus Version 2 stammt
 * oder aus der Zeit mit genau einem Repo je Projekt.
 */
export function repositoriesOf(project: ExportedProject): ExportedRepository[] {
  if (project.repositories?.length) return project.repositories;
  if (!project.repoUrl && !(project.repoOwner && project.repoName)) return [];
  return [
    {
      label: null,
      repoUrl: project.repoUrl ?? null,
      repoOwner: project.repoOwner ?? null,
      repoName: project.repoName ?? null,
      autoSync: project.autoSync,
      connection: project.connection ?? null,
    },
  ];
}
export type ExportFile = z.infer<typeof exportFileSchema>;

/** Dateiname ohne Sonderzeichen, mit Datumsstempel. */
export function exportFileName(prefix: string, date: Date, extension: string): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${safe || "nebula"}-${stamp}.${extension}`;
}
