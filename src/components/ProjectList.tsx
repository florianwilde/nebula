"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  GitBranch,
  GitCommitHorizontal,
  NotebookPen,
  Star,
} from "lucide-react";
import { StatusSelect } from "@/components/StatusSelect";
import { PRIORITY_META, accentOf, statusOf } from "@/lib/status";
import { cn, formatRelative } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

/**
 * Listenansicht des Boards.
 *
 * Warum zusaetzlich zum Raster: eine Karte braucht rund 260px Hoehe, auf dem
 * Telefon steht sie zwangslaeufig allein in der Zeile. Fuenf Projekte fuellen
 * damit zwei Bildschirme, bevor man ueberhaupt etwas vergleichen kann. Eine
 * Zeile kommt mit einem Viertel davon aus, und weil alle Zeilen gleich
 * aufgebaut sind, liegen Name, Fortschritt und Status untereinander – genau
 * das, was das Raster auf schmalen Anzeigen verliert.
 */
export function ProjectList({
  projects,
  selection,
  onToggleSelect,
}: {
  projects: ProjectListItem[];
  selection: Set<string>;
  onToggleSelect?: (id: string, selected: boolean) => void;
}) {
  return (
    <ul className="glass fade-up divide-y divide-white/6 overflow-hidden">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          selected={selection.has(project.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </ul>
  );
}

function ProjectRow({
  project,
  selected,
  onToggleSelect,
}: {
  project: ProjectListItem;
  selected: boolean;
  onToggleSelect?: (id: string, selected: boolean) => void;
}) {
  const accent = accentOf(project.accent);
  const meta = statusOf(project.status);
  const priority = PRIORITY_META[project.priority] ?? PRIORITY_META[2];
  const snapshot = project.repositories[0]?.snapshot ?? null;
  const syncError = project.repositories.find((repo) => repo.syncError)?.syncError ?? null;
  const [favorite, setFavorite] = useState(project.favorite);

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      setFavorite(!next);
    }
  }

  return (
    <li
      className={cn("group relative transition-colors", selected && "bg-violet-500/8")}
      style={
        {
          "--accent-from": accent.from,
          "--accent-to": accent.to,
        } as React.CSSProperties
      }
    >
      {/* Die ganze Zeile ist der Link; was darueber bedienbar sein soll,
          bekommt weiter unten die Zeigerereignisse zurueck. */}
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0 z-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
        aria-label={`Projekt ${project.name} oeffnen`}
      />

      <div className="pointer-events-none relative z-10 flex items-center gap-2.5 px-3 py-2.5 transition-colors group-hover:bg-white/4 sm:gap-3 sm:px-4 sm:py-3">
        {onToggleSelect ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggleSelect(project.id, event.target.checked)}
            aria-label={`${project.name} auswaehlen`}
            className={cn(
              "pointer-events-auto h-4 w-4 shrink-0 accent-violet-500 transition-opacity",
              !selected && "opacity-35 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          />
        ) : null}

        {/* Statusfarbe als Streifen: auf einen Blick erkennbar, ohne Platz
            fuer eine Beschriftung zu verbrauchen. */}
        <span
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color }}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-white group-hover:text-violet-200">
              {project.name}
            </h3>
            {favorite ? (
              <Star className="h-3 w-3 shrink-0 fill-amber-300 text-amber-300" />
            ) : null}
            {syncError ? (
              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-300/80" aria-label="Sync-Fehler" />
            ) : null}
          </div>

          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/8 sm:w-24">
              <span
                className="accent-bar block h-full rounded-full"
                style={{ width: `${Math.max(2, project.progress)}%` }}
              />
            </span>
            <span className="shrink-0 tabular-nums">{project.progress}%</span>

            {/* Was nicht mehr in die Zeile passt, faellt der Reihe nach weg,
                statt sie zu sprengen. */}
            {project._count.tasks > 0 ? (
              <span className="hidden shrink-0 items-center gap-1 xs:inline-flex">
                <CheckSquare className="h-3 w-3" />
                {project.tasks.length}/{project._count.tasks}
              </span>
            ) : null}
            {project._count.notes > 0 ? (
              <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
                <NotebookPen className="h-3 w-3" />
                {project._count.notes}
              </span>
            ) : null}
            {snapshot?.defaultBranch ? (
              <span className="hidden shrink-0 items-center gap-1 font-mono md:inline-flex">
                <GitBranch className="h-3 w-3" />
                {snapshot.defaultBranch}
              </span>
            ) : null}
            {snapshot?.lastCommitAt ? (
              <span
                className="hidden shrink-0 items-center gap-1 lg:inline-flex"
                suppressHydrationWarning
              >
                <GitCommitHorizontal className="h-3 w-3" />
                {formatRelative(snapshot.lastCommitAt)}
              </span>
            ) : null}

            <span
              className="ml-auto hidden shrink-0 uppercase tracking-wider md:inline"
              style={{ color: priority.color }}
              title={`Prioritaet: ${priority.label}`}
            >
              {priority.label}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
          className={cn(
            "pointer-events-auto hidden shrink-0 rounded-lg p-2 transition-colors sm:block",
            favorite
              ? "text-amber-300 hover:bg-amber-400/10"
              : "text-slate-600 hover:bg-white/8 hover:text-amber-300",
          )}
        >
          <Star className={cn("h-4 w-4", favorite && "fill-current")} />
        </button>

        <div className="pointer-events-auto shrink-0">
          <StatusSelect projectId={project.id} status={project.status} variant="compact" />
        </div>
      </div>
    </li>
  );
}
