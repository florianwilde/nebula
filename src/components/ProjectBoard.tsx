"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Columns3,
  Database,
  Download,
  LayoutGrid,
  List,
  ListFilter,
  NotebookPen,
  Plus,
  Rows3,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { ProjectStatus, TaskStatus } from "@prisma/client";
import { BulkBar } from "@/components/BulkBar";
import { ImportDialog } from "@/components/ImportDialog";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ProjectList } from "@/components/ProjectList";
import { Popover } from "@/components/ui/Popover";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { TASK_STATUS_META } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import type { ConnectionSafe, ProjectListItem } from "@/types";

interface TaskHit {
  projectId: string;
  taskId: string;
  title: string;
  status: string;
  snippet: string;
}

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
type ViewMode = "grid" | "list" | "grouped" | "kanban";

const VIEWS: ViewMode[] = ["grid", "list", "grouped", "kanban"];

/** Reihenfolge der Umschalter – zugleich die Beschriftung der Knoepfe. */
const VIEW_META: Record<ViewMode, { label: string; title: string; icon: typeof LayoutGrid }> = {
  grid: { label: "Raster", title: "Rasteransicht", icon: LayoutGrid },
  list: { label: "Liste", title: "Kompakte Liste", icon: List },
  grouped: { label: "Gruppiert", title: "Nach Status gruppiert", icon: Rows3 },
  kanban: { label: "Brett", title: "Kanban – Status per Ziehen aendern", icon: Columns3 },
};

/** Wo Ansicht, Sortierung und Archivschalter im Browser liegen. */
const ANSICHT_SCHLUESSEL = "nebula.board";

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

  /**
   * Ansicht und Sortierung ueberdauern das Neuladen.
   *
   * Wer sein Brett von Hand anordnet, will es beim naechsten Aufruf auch
   * sehen und nicht wieder das Raster. Bewusst erst nach dem ersten Rendern
   * gelesen: der Server kennt den gespeicherten Wert nicht, und ein
   * Unterschied zwischen beiden waere ein Hydrationsfehler.
   *
   * Der Suchbegriff bleibt aussen vor – eine Suche von gestern beim Oeffnen
   * wiederherzustellen waere eher verwirrend als hilfreich.
   */
  useEffect(() => {
    try {
      const gespeichert = window.localStorage.getItem(ANSICHT_SCHLUESSEL);
      if (!gespeichert) return;
      const wert = JSON.parse(gespeichert) as Partial<{
        view: ViewMode;
        sort: SortKey;
        showArchived: boolean;
      }>;
      if (wert.view && VIEWS.includes(wert.view)) setView(wert.view);
      if (wert.sort && wert.sort in SORT_LABEL) setSort(wert.sort);
      if (typeof wert.showArchived === "boolean") setShowArchived(wert.showArchived);
    } catch {
      // Kaputter oder gesperrter Speicher: dann eben die Voreinstellung.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ANSICHT_SCHLUESSEL,
        JSON.stringify({ view, sort, showArchived }),
      );
    } catch {
      // Im privaten Modus mancher Browser nicht beschreibbar – kein Grund,
      // die Seite scheitern zu lassen.
    }
  }, [view, sort, showArchived]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const dataButtonRef = useRef<HTMLButtonElement>(null);
  const [noteHits, setNoteHits] = useState<NoteHit[]>([]);
  const [taskHits, setTaskHits] = useState<TaskHit[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());

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
      setTaskHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { hits: NoteHit[]; tasks: TaskHit[] };
        setNoteHits(body.hits ?? []);
        setTaskHits(body.tasks ?? []);
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
    () =>
      new Set([
        ...noteHits.map((hit) => hit.projectId),
        ...taskHits.map((hit) => hit.projectId),
      ]),
    [noteHits, taskHits],
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
        project.repositories.some((repo) =>
          (repo.snapshot?.fullName ?? "").toLowerCase().includes(needle),
        ) ||
        // Treffer in Notizen und Aufgaben kommen vom Server dazu.
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

  /**
   * Was der Filter ausblendet, bleibt nicht ausgewaehlt. Sonst traefe eine
   * Massenaenderung Projekte, die man gar nicht mehr vor Augen hat.
   */
  useEffect(() => {
    setSelection((current) => {
      if (current.size === 0) return current;
      const sichtbar = new Set(visible.map((project) => project.id));
      const next = new Set([...current].filter((id) => sichtbar.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visible]);

  function toggleSelect(id: string, selected: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

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
      {/* Steuerleiste.
          Auf dem Telefon steht die Suche allein in der ersten Zeile und die
          Werkzeuge darunter. Frueher lagen beide in einer Zeile, die nicht
          umbrechen konnte – der Knopf "Neues Projekt" wurde dabei aus dem
          Bild geschoben und die ganze Seite seitlich scrollbar. */}
      <div className="glass flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 sm:min-w-[220px] sm:flex-1">
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
            {/* min-w-0 ist hier entscheidend: ohne das weigert sich ein
                Flex-Kind, unter seine Inhaltsbreite zu schrumpfen, und
                drueckt stattdessen die Nachbarn hinaus. */}
            <select
              id="sort"
              className="field w-auto min-w-0 flex-1 truncate sm:flex-none sm:min-w-[11rem]"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              // Im Brett zaehlt die Anordnung von Hand. Die Sortierung hier
              // stehen zu lassen, ohne dass sie etwas bewirkt, waere irrefuehrend.
              disabled={view === "kanban"}
              title={
                view === "kanban"
                  ? "Im Brett bestimmt die Reihenfolge, in der du die Karten ablegst."
                  : undefined
              }
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key]}
                </option>
              ))}
            </select>

            <button
              ref={dataButtonRef}
              type="button"
              onClick={() => setDataMenuOpen((value) => !value)}
              className="shrink-0 rounded-xl border border-white/9 p-2.5 text-slate-500 transition-colors hover:text-white"
              aria-label="Daten exportieren oder importieren"
              title="Export und Import"
              aria-haspopup="menu"
              aria-expanded={dataMenuOpen}
            >
              <Database className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="btn btn-primary shrink-0"
              onClick={() => setDialogOpen(true)}
              // Unterhalb von sm bleibt nur das Pluszeichen stehen. Ohne
              // eigene Beschriftung liest ein Screenreader dann gar nichts vor.
              aria-label="Neues Projekt"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Neues Projekt</span>
            </button>
          </div>
        </div>

        {/* Ansichtsumschalter: auf schmalen Anzeigen ueber die volle Breite,
            damit die vier Knoepfe gross genug zum Treffen bleiben. */}
        <div
          className="flex overflow-hidden rounded-xl border border-white/9 sm:w-auto sm:self-start"
          role="group"
          aria-label="Ansicht"
        >
          {VIEWS.map((mode) => {
            const { label, title, icon: Icon } = VIEW_META[mode];
            const active = view === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs transition-colors sm:flex-none",
                  active ? "bg-white/10 text-white" : "text-slate-500 hover:text-white",
                )}
                aria-pressed={active}
                title={title}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {/* Nur auf den schmalsten Anzeigen bleiben die Symbole allein –
                    dort waeren vier Beschriftungen enger als die Fingerkuppe. */}
                <span className="hidden xs:inline">{label}</span>
              </button>
            );
          })}
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

      {/* Treffer in Aufgaben */}
      {taskHits.length > 0 ? (
        <div className="glass fade-up p-4">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <CheckSquare className="h-3.5 w-3.5 text-emerald-300" />
            Treffer in Aufgaben
            <span className="rounded-full bg-white/6 px-2 py-0.5 tabular-nums text-slate-400">
              {taskHits.length}
            </span>
          </h2>
          <ul className="space-y-1">
            {taskHits.slice(0, 8).map((hit) => {
              const project = projects.find((entry) => entry.id === hit.projectId);
              const status = TASK_STATUS_META[hit.status as TaskStatus];
              return (
                <li key={hit.taskId}>
                  <Link
                    href={`/projects/${hit.projectId}`}
                    className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm text-slate-200">{hit.title}</span>
                      <span className="text-[11px] text-slate-500">
                        · {project?.name ?? "Projekt"}
                      </span>
                      {status ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px]"
                          style={{ color: status.color }}
                        >
                          {status.label}
                        </span>
                      ) : null}
                    </span>
                    {/* Nur wenn die Beschreibung etwas beitraegt – passte
                        allein der Titel, ist der Ausschnitt leer. */}
                    {hit.snippet.trim() ? (
                      <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                        {highlight(hit.snippet)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {taskHits.length > 8 ? (
            <p className="mt-2 px-2.5 text-[11px] text-slate-600">
              … und {taskHits.length - 8} weitere
            </p>
          ) : null}
        </div>
      ) : null}

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
        <KanbanBoard
          projects={visible}
          showArchived={showArchived}
          selection={selection}
          onToggleSelect={toggleSelect}
        />
      ) : view === "list" ? (
        <ProjectList projects={visible} selection={selection} onToggleSelect={toggleSelect} />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              selected={selection.has(project.id)}
              onToggleSelect={toggleSelect}
            />
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
                    <ProjectCard
                      key={project.id}
                      project={project}
                      index={index}
                      selected={selection.has(project.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selection.size > 0 ? (
        <BulkBar
          ids={[...selection]}
          onDone={() => setSelection(new Set())}
          onClear={() => setSelection(new Set())}
        />
      ) : null}

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
