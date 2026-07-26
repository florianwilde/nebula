import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { exportFileSchema, type ExportedProject } from "@/lib/export/format";
import { uniqueSlug } from "@/lib/projects";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import {
  IMPORT_MAX_BODY_BYTES,
  clientIp,
  jsonError,
  readJsonBody,
  tooManyRequests,
} from "@/lib/security/request";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  data: z.unknown(),
  /**
   * skip      – vorhandene Projekte unveraendert lassen
   * rename    – zusaetzlich anlegen, mit freiem Slug
   * overwrite – vorhandenes Projekt ersetzen (Notizen werden ausgetauscht)
   */
  strategy: z.enum(["skip", "rename", "overwrite"]).default("skip"),
  /** Nur pruefen und berichten, nichts schreiben. */
  dryRun: z.boolean().default(true),
});

type Action = "create" | "rename" | "overwrite" | "skip" | "error";

interface ItemResult {
  name: string;
  slug: string;
  action: Action;
  /** Bei "rename" der tatsaechlich vergebene Slug. */
  newSlug?: string;
  notes: number;
  /** matched: Verbindung gefunden · missing: beschrieben, aber nicht vorhanden */
  connection: "matched" | "missing" | "none";
  connectionName?: string;
  message?: string;
}

export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `import:${clientIp(request)}`,
    LIMITS.mutation.limit,
    LIMITS.mutation.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJsonBody(request, IMPORT_MAX_BODY_BYTES);
  if (!body.ok) return body.response;

  const outer = requestSchema.safeParse(body.data);
  if (!outer.success) return jsonError("Ungueltige Anfrage.", 422);

  // Die hochgeladene Datei ist Fremdinhalt – strikt pruefen, bevor irgendetwas
  // damit passiert.
  const parsed = exportFileSchema.safeParse(outer.data.data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error:
          "Die Datei passt nicht zum erwarteten Format. " +
          (first ? `${first.path.join(".") || "Datei"}: ${first.message}` : ""),
      },
      { status: 422 },
    );
  }

  const { strategy, dryRun } = outer.data;
  const file = parsed.data;

  // Verbindungen des Kontos einmal laden, um sie den Projekten zuzuordnen.
  const connections = await prisma.gitConnection.findMany({
    where: { ownerId: auth.user.id },
    select: { id: true, name: true, provider: true, baseUrl: true },
  });

  function matchConnection(described: ExportedProject["connection"]) {
    if (!described) return null;
    const byName = connections.find(
      (candidate) => candidate.name.toLowerCase() === described.name.toLowerCase(),
    );
    if (byName) return byName;
    return (
      connections.find(
        (candidate) =>
          candidate.provider === described.provider &&
          candidate.baseUrl.replace(/\/+$/, "").toLowerCase() ===
            described.baseUrl.replace(/\/+$/, "").toLowerCase(),
      ) ?? null
    );
  }

  const results: ItemResult[] = [];

  for (const incoming of file.projects) {
    const slug = incoming.slug || slugify(incoming.name) || "projekt";
    const connection = matchConnection(incoming.connection);
    const connectionState: ItemResult["connection"] = incoming.connection
      ? connection
        ? "matched"
        : "missing"
      : "none";

    const existing = await prisma.project.findFirst({
      where: { slug, ownerId: auth.user.id },
      select: { id: true },
    });

    const base: ItemResult = {
      name: incoming.name,
      slug,
      action: "create",
      notes: incoming.notes.length,
      connection: connectionState,
      connectionName: incoming.connection?.name,
    };

    if (existing && strategy === "skip") {
      results.push({ ...base, action: "skip", message: "Slug bereits vergeben." });
      continue;
    }

    const action: Action = !existing ? "create" : strategy === "rename" ? "rename" : "overwrite";

    if (dryRun) {
      results.push({
        ...base,
        action,
        ...(action === "rename" ? { newSlug: `${slug}-…` } : {}),
        ...(action === "overwrite"
          ? { message: "Ersetzt Stammdaten und tauscht die Notizen aus." }
          : {}),
      });
      continue;
    }

    const data = {
      name: incoming.name,
      summary: incoming.summary ?? null,
      description: incoming.description ?? null,
      status: incoming.status,
      priority: incoming.priority,
      progress: incoming.progress,
      accent: incoming.accent,
      tags: incoming.tags,
      favorite: incoming.favorite,
      autoSync: incoming.autoSync,
      repoUrl: incoming.repoUrl ?? null,
      repoOwner: incoming.repoOwner ?? null,
      repoName: incoming.repoName ?? null,
      connectionId: connection?.id ?? null,
      progressFromTasks: incoming.progressFromTasks,
    };

    const tasks = incoming.tasks.map((task, index) => ({
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      // Position aus der Datei uebernehmen, notfalls die Reihenfolge in ihr.
      position: task.position ?? index,
      dueDate: task.dueDate && !Number.isNaN(Date.parse(task.dueDate))
        ? new Date(task.dueDate)
        : null,
      labels: task.labels,
      doneAt: task.status === "DONE" ? new Date() : null,
      ...(task.createdAt && !Number.isNaN(Date.parse(task.createdAt))
        ? { createdAt: new Date(task.createdAt) }
        : {}),
    }));

    const notes = incoming.notes.map((note) => ({
      title: note.title ?? null,
      content: note.content,
      pinned: note.pinned ?? false,
      ...(note.createdAt && !Number.isNaN(Date.parse(note.createdAt))
        ? { createdAt: new Date(note.createdAt) }
        : {}),
    }));

    try {
      if (existing && action === "overwrite") {
        // Notizen austauschen statt zusammenfuehren: vorhersagbar, und ein
        // erneuter Import erzeugt keine Dubletten.
        await prisma.$transaction([
          prisma.note.deleteMany({ where: { projectId: existing.id } }),
          prisma.task.deleteMany({ where: { projectId: existing.id } }),
          prisma.project.update({
            where: { id: existing.id },
            data: { ...data, slug, notes: { create: notes }, tasks: { create: tasks } },
          }),
        ]);
        results.push({ ...base, action: "overwrite" });
      } else {
        const finalSlug = existing ? await uniqueSlug(incoming.name, auth.user.id) : slug;
        const angelegt = await prisma.project.create({
          data: {
            ...data,
            ownerId: auth.user.id,
            slug: finalSlug,
            notes: { create: notes },
            tasks: { create: tasks },
          },
        });
        // Der Verlauf wird nicht mitexportiert – der erste Eintrag hier haelt
        // wenigstens fest, woher das Projekt stammt.
        await recordActivity({
          projectId: angelegt.id,
          userId: auth.user.id,
          kind: "PROJECT_CREATED",
          summary: "Aus einer Exportdatei importiert",
          meta: { notes: notes.length, tasks: tasks.length },
        });
        results.push({
          ...base,
          action: existing ? "rename" : "create",
          ...(existing ? { newSlug: finalSlug } : {}),
        });
      }
    } catch (error) {
      results.push({
        ...base,
        action: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((entry) => entry.action === "create").length,
    renamed: results.filter((entry) => entry.action === "rename").length,
    overwritten: results.filter((entry) => entry.action === "overwrite").length,
    skipped: results.filter((entry) => entry.action === "skip").length,
    errors: results.filter((entry) => entry.action === "error").length,
    missingConnections: results.filter((entry) => entry.connection === "missing").length,
  };

  return NextResponse.json({ dryRun, strategy, summary, results });
}
