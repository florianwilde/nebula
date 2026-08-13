"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookmarkPlus,
  CalendarDays,
  CheckSquare,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  Loader2,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { ProjectDialog } from "@/components/ProjectDialog";
import { SaveTemplateDialog } from "@/components/SaveTemplateDialog";
import { StatusSelect } from "@/components/StatusSelect";
import { Popover } from "@/components/ui/Popover";
import { repoTitle } from "@/lib/git/meta";
import { PRIORITY_META, accentOf } from "@/lib/status";
import { cn, formatDate } from "@/lib/utils";
import type { ConnectionSafe, ProjectDetail } from "@/types";

export function ProjectHeader({
  project,
  connections,
}: {
  project: ProjectDetail;
  connections: ConnectionSafe[];
}) {
  const router = useRouter();
  const accent = accentOf(project.accent);
  const priority = PRIORITY_META[project.priority] ?? PRIORITY_META[2];

  const [editOpen, setEditOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [favorite, setFavorite] = useState(project.favorite);
  const [progress, setProgress] = useState(project.progress);
  const [deleting, setDeleting] = useState(false);

  async function patch(payload: Record<string, unknown>) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
    router.refresh();
  }

  async function remove() {
    if (
      !window.confirm(
        `„${project.name}“ mit allen Notizen unwiderruflich loeschen?`,
      )
    ) {
      return;
    }
    setDeleting(true);
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/");
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  return (
    <header
      className="glass relative overflow-hidden p-4 sm:p-6"
      style={
        {
          "--accent-from": accent.from,
          "--accent-to": accent.to,
        } as React.CSSProperties
      }
    >
      <span className="accent-bar absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: `radial-gradient(circle, ${accent.from}, transparent 70%)` }}
        aria-hidden="true"
      />

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-violet-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurueck zum Dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {project.name}
            </h1>
            <button
              type="button"
              onClick={() => {
                const next = !favorite;
                setFavorite(next);
                void patch({ favorite: next });
              }}
              aria-label={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                favorite
                  ? "text-amber-300 hover:bg-amber-400/10"
                  : "text-slate-600 hover:bg-white/8 hover:text-amber-300",
              )}
            >
              <Star className={cn("h-4 w-4", favorite && "fill-current")} />
            </button>
          </div>

          <p className="mt-1 font-mono text-xs text-slate-600">/{project.slug}</p>

          {project.summary ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              {project.summary}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              angelegt {formatDate(project.createdAt)}
            </span>
            <span style={{ color: priority.color }}>Prioritaet: {priority.label}</span>
            {/* Alle Repositories verlinken – bei einem einzigen sieht das aus
                wie vorher, bei mehreren steht jedes fuer sich. */}
            {project.repositories
              .filter((repository) => repository.repoUrl)
              .map((repository) => (
                <a
                  key={repository.id}
                  href={repository.repoUrl!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-violet-300 transition-colors hover:text-violet-200"
                >
                  {project.repositories.length === 1 ? "Repository" : repoTitle(repository)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
          </div>

          {project.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Auf dem Telefon steht dieser Block unter dem Titel und faengt
            links an; erst ab sm rueckt er nach rechts neben ihn. Vorher
            standen vier Knoepfe in einer Zeile, die nicht umbrechen durfte –
            "Loeschen" lag damit ausserhalb des Bildschirms. */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-3">
          <StatusSelect projectId={project.id} status={project.status} />
          <div className="flex flex-wrap gap-2">
            <button
              ref={exportButtonRef}
              type="button"
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              onClick={() => setExportOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              title="Exportieren"
              aria-label="Exportieren"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              onClick={() => setTemplateOpen(true)}
              title="Als Vorlage sichern"
              aria-label="Als Vorlage sichern"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Bearbeiten
            </button>
            <button
              type="button"
              className="btn btn-danger px-3 py-1.5 text-xs"
              onClick={remove}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Loeschen
            </button>
          </div>
        </div>
      </div>

      {/* Fortschritt direkt regelbar */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            Fortschritt
            {project.progressFromTasks ? (
              <span className="inline-flex items-center gap-1 rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-slate-400">
                <CheckSquare className="h-2.5 w-2.5" />
                aus Aufgaben
              </span>
            ) : null}
          </span>
          <span className="tabular-nums text-slate-300">{progress}%</span>
        </div>
        {/* Eigener Regler statt eines unsichtbaren Eingabefelds ueber einem
            gezeichneten Balken: so gibt es einen sichtbaren Griff. */}
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(event) => setProgress(Number(event.target.value))}
          onMouseUp={() => patch({ progress })}
          onTouchEnd={() => patch({ progress })}
          onKeyUp={() => patch({ progress })}
          aria-label="Fortschritt anpassen"
          // Wird der Wert aus Aufgaben abgeleitet, waere ein Zug hier
          // wirkungslos – er wuerde beim naechsten Aufgabenwechsel wieder
          // ueberschrieben.
          disabled={project.progressFromTasks}
          className={cn("range", project.progressFromTasks && "cursor-not-allowed opacity-50")}
          style={{ "--fill": `${progress}%` } as React.CSSProperties}
        />
      </div>

      <Popover
        anchorRef={exportButtonRef}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        width={250}
      >
        <a
          href={`/api/projects/${project.id}/export`}
          download
          role="menuitem"
          onClick={() => setExportOpen(false)}
          className="flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white"
        >
          <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <span>
            Als JSON
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Zum Wiedereinlesen, mit Notizen
            </span>
          </span>
        </a>
        <a
          href={`/api/projects/${project.id}/export?format=md`}
          download
          role="menuitem"
          onClick={() => setExportOpen(false)}
          className="flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white"
        >
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <span>
            Als Markdown
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Lesbar, inklusive Git-Stand
            </span>
          </span>
        </a>
      </Popover>

      <ProjectDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        connections={connections}
        project={project}
      />

      <SaveTemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        projectId={project.id}
        projectName={project.name}
        noteCount={project.notes.length}
        // Erledigte kommen nicht mit – hier steht, was wirklich uebernommen wird.
        taskCount={project.tasks.filter((task) => task.status !== "DONE").length}
      />
    </header>
  );
}
