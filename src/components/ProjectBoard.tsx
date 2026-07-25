"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Columns3,
  Database,
  Download,
  LayoutGrid,
  ListFilter,
  NotebookPen,
  Plus,
  Rows3,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { ImportDialog } from "@/components/ImportDialog";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectDialog } from "@/components/ProjectDialog";
import { Popover } from "@/components/ui/Popover";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ConnectionSafe, ProjectListItem } from "@/types";

interface NoteHit {
  projectId: string;
  noteId: string;
  title: string | null;
  /** Ausschnitt mit [[…]] um die Fundstelle – siehe /api/search. */
  snippet: string;
}

/**
 * Wandelt die [[…]]-Markierungen von ts_headline in hervorgehobene Stellen.
 * Bewusst kein HTML aus der Datenbank einbetten – der Text stammt aus einer
 * Notiz und damit vom Benutzer.
 */
function highlight(snippet: string): React.ReactNode[] {
  return snippet.split(/(\[\[.*?\]\])/g).map((part, index) => {
    if (part.startsWith("[[") && part.endsWith("]]")) {
      return (
        <mark key={index} className="rounded bg-violet-500/25 px-0.5 text-violet-100">
          {part.slice(2, -2)}
        </mark>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

type SortKey = "updated" | "created" | "name" | "progress" | "priority";
type ViewMode = "grid" | "grouped" | "kanban";

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Zuletzt geaendert",
  created: "Neueste zuerst",
  name: "Name (A–Z)",
  progress: "Fortschritt",
  priority: "Prioritaet",
};

export function ProjectBoard({
  projects,
  connections,
}: {
  projects: ProjectListItem[];
  connections: ConnectionSafe[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus[]>([]);
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataButtonRef = useRef<HTMLButtonElement>(null);
  const [noteHits, setNoteHits] = useState<NoteHit[]>([]);

  /**
   * Notizen liegen im Board nicht vor – sie mitzuladen wuerde die Seite
   * unnoetig aufblaehen. Stattdessen sucht Postgres serverseitig, sobald der
   * Begriff lang genug ist. Entprellt, damit nicht jeder Tastendruck eine
   * Abfrage ausloest.
   */
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setNoteHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { hits: NoteHit[] };
        setNoteHits(body.hits ?? []);
      } catch {
        // Abgebrochene Anfragen sind der Normalfall beim Tippen.
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const noteHitProjectIds = useMemo(
    () => new Set(noteHits.map((hit) => hit.projectId)),
    [noteHits],
  );

  const counts = useMemo(() => {
    const map = new Map<ProjectStatus, number>();
    for (const project of projects) {
      map.set(project.status, (map.get(project.status) ?? 0) + 1);
    }
    return map;
  }, [projects]);

  const visible = useMemo(() => {
    const needle = query.toLowerCase().trim();

    const filtered = projects.filter((project) => {
      if (!showArchived && project.status === "ARCHIVED" && !statusFilter.includes("ARCHIVED")) {
        return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(project.status)) return false;
      if (!needle) return true;
      return (
        project.name.toLowerCase().includes(needle) ||
        (project.summary ?? "").toLowerCase().includes(needle) ||
        (project.description ?? "").toLowerCase().includes(needle) ||
        project.tags.some((tag) => tag.includes(needle)) ||
        (project.snapshot?.fullName ?? "").toLowerCase().includes(needle) ||
        // Treffer in Notizen kommen vom Server dazu.
        noteHitProjectIds.has(project.id)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name, "de");
        case "progress":
          return b.progress - a.progress;
        case "priority":
          return b.priority - a.priority;
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return sorted;
  }, [projects, query, statusFilter, sort, showArchived, noteHitProjectIds]);

  const grouped = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      items: visible.filter((project) => project.status === status),
    })).filter((group) => group.items.length > 0);
  }, [visible]);

  function toggleStatus(status: ProjectStatus) {
    setStatusFilter((current) =>
      current.includes(status)
        ? current.filter((entry) => entry !== status)
        : [...current, status],
    );
  }

  const hasFilters = query.length > 0 || statusFilter.length > 0;

  return (
    <section className="space-y-5">
      {/* Steuerleiste */}
      <div className="glass flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="field pl-9"
              placeholder="Projekte, Tags oder Repos durchsuchen…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-white"
                aria-label="Suche zuruecksetzen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="sort">
              Sortierung
            </label>
            <select
              id="sort"
              className="field w-auto min-w-[11rem]"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key]}
                </option>
              ))}
            </select>

            <div className="flex overflow-hidden rounded-xl border border-white/9">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "p-2 transition-colors",
                  view === "grid" ? "bg-white/10 text-white" : "text-slate-500 hover:text-white",
                )}
                aria-label="Rasteransicht"
                title="Rasteransicht"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("grouped")}
                className={cn(
                  "p-2 transition-colors",
                  view === "grouped" ? "bg-white/10 text-white" : "text-slate-500 hover:text-white",
                )}
                aria-label="Nach Status gruppiert"
                title="Nach Status gruppiert"
              >
                <Rows3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={cn(
                  "p-2 transition-colors",
                  view === "kanban" ? "bg-white/10 text-white" : "text-slate-500 hover:text-white",
                )}
                aria-label="Kanban-Spalten"
                title="Kanban – Status per Ziehen aendern"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>

            <button
              ref={dataButtonRef}
              type="button"
              onClick={() => setDataMenuOpen((value) => !value)}
              className="rounded-xl border border-white/9 p-2 text-slate-500 transition-colors hover:text-white"
              aria-label="Daten exportieren oder importieren"
              title="Export und Import"
              aria-haspopup="menu"
              aria-expanded={dataMenuOpen}
            >
              <Database className="h-4 w-4" />
            </button>

            <button type="button" className="btn btn-primary" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Neues Projekt</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            <ListFilter className="h-3.5 w-3.5" />
            Status
          </span>
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const active = statusFilter.includes(status);
            const count = counts.get(status) ?? 0;
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-all",
                  active
                    ? meta.className
                    : "text-slate-400 ring-white/10 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta.color, opacity: active ? 1 : 0.55 }}
                />
                {meta.label}
                <span className="tabular-nums text-slate-500">{count}</span>
              </button>
            );
          })}

          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-3.5 w-3.5 accent-violet-500"
            />
            Archiv einblenden
          </label>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter([]);
              }}
              className="text-xs text-violet-300 underline-offset-2 hover:underline"
            >
              Filter zuruecksetzen
            </button>
          ) : null}
        </div>
      </div>

      {/* Treffer in Notizen */}
      {noteHits.length > 0 ? (
        <div className="glass fade-up p-4">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <NotebookPen className="h-3.5 w-3.5 text-violet-300" />
            Treffer in Notizen
            <span className="rounded-full bg-white/6 px-2 py-0.5 tabular-nums text-slate-400">
              {noteHits.length}
            </span>
          </h2>
          <ul className="space-y-1">
            {noteHits.slice(0, 8).map((hit) => {
              const project = projects.find((entry) => entry.id === hit.projectId);
              return (
                <li key={hit.noteId}>
                  <Link
                    href={`/projects/${hit.projectId}`}
                    className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm text-slate-200">
                        {project?.name ?? "Projekt"}
                      </span>
                      {hit.title ? (
                        <span className="text-[11px] text-slate-500">· {hit.title}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                      {highlight(hit.snippet)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {noteHits.length > 8 ? (
            <p className="mt-2 px-2.5 text-[11px] text-slate-600">
              … und {noteHits.length - 8} weitere
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Inhalt */}
      {visible.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onCreate={() => setDialogOpen(true)} />
      ) : view === "kanban" ? (
        <KanbanBoard projects={visible} showArchived={showArchived} />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => {
            const meta = STATUS_META[group.status];
            return (
              <div key={group.status}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span
                    className="accent-dot h-2 w-2 rounded-full"
                    style={{ backgroundColor: meta.color, color: meta.color }}
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                    {meta.label}
                  </h2>
                  <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
                    {group.items.length}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.items.map((project, index) => (
                    <ProjectCard key={project.id} project={project} index={index} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Popover
        anchorRef={dataButtonRef}
        open={dataMenuOpen}
        onClose={() => setDataMenuOpen(false)}
        width={260}
      >
        <a
          href="/api/projects/export"
          download
          role="menuitem"
          onClick={() => setDataMenuOpen(false)}
          className="flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <span>
            Alle Projekte exportieren
            <span className="mt-0.5 block text-[11px] text-slate-500">
              JSON mit Notizen, ohne Access Tokens
            </span>
          </span>
        </a>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setDataMenuOpen(false);
            setImportOpen(true);
          }}
          className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Upload className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <span>
            Projekte importieren
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Mit Vorschau vor dem Schreiben
            </span>
          </span>
        </button>
      </Popover>

      <ProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        connections={connections}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </section>
  );
}

function EmptyState({
  hasFilters,
  onCreate,
}: {
  hasFilters: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="glass fade-up flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/20 text-violet-200">
        <Plus className="h-6 w-6" />
      </span>
      <div>
        <h3 className="text-lg font-semibold text-white">
          {hasFilters ? "Keine Treffer" : "Noch keine Projekte"}
        </h3>
        <p className="mt-1 max-w-md text-sm text-slate-400">
          {hasFilters
            ? "Kein Projekt passt zu Suche und Filtern. Filter anpassen oder zuruecksetzen."
            : "Leg deine erste Idee an – Beschreibung, Repo und Status kannst du jederzeit nachziehen."}
        </p>
      </div>
      {!hasFilters ? (
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Erstes Projekt anlegen
        </button>
      ) : null}
    </div>
  );
}
