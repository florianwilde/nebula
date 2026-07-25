"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, ListFilter, Plus, Rows3, Search, X } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectDialog } from "@/components/ProjectDialog";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ConnectionSafe, ProjectListItem } from "@/types";

type SortKey = "updated" | "created" | "name" | "progress" | "priority";
type ViewMode = "grid" | "grouped";

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
        (project.snapshot?.fullName ?? "").toLowerCase().includes(needle)
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
  }, [projects, query, statusFilter, sort, showArchived]);

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
            </div>

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

      {/* Inhalt */}
      {visible.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onCreate={() => setDialogOpen(true)} />
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

      <ProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        connections={connections}
      />
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
