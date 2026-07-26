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
  Tag,
} from "lucide-react";
import { CiBadge } from "@/components/CiBadge";
import { Sparkline } from "@/components/Sparkline";
import { StatusSelect } from "@/components/StatusSelect";
import { repoTitle } from "@/lib/git/meta";
import { PRIORITY_META, accentOf } from "@/lib/status";
import { cn, formatRelative, truncate } from "@/lib/utils";
import { asArray, type ProjectListItem } from "@/types";

const PROVIDER_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  GITEA: "Gitea",
};

/**
 * Karte im Board. Die gesamte Flaeche ist ein Link (per "stretched link"),
 * interaktive Elemente liegen darueber und bekommen pointer-events zurueck.
 */
export function ProjectCard({
  project,
  index = 0,
  selected = false,
  onToggleSelect,
}: {
  project: ProjectListItem;
  index?: number;
  selected?: boolean;
  onToggleSelect?: (id: string, selected: boolean) => void;
}) {
  const accent = accentOf(project.accent);
  const priority = PRIORITY_META[project.priority] ?? PRIORITY_META[2];
  // Auf der Karte ist nur fuer eines Platz: das fuehrende. Wie viele es
  // insgesamt sind, sagt die Zahl daneben.
  const leading = project.repositories[0] ?? null;
  const snapshot = leading?.snapshot ?? null;
  const weitere = project.repositories.length - 1;
  // Ein Fehler an irgendeinem Repo gehoert auf die Karte, nicht nur einer am
  // fuehrenden – sonst bliebe er unbemerkt.
  const syncError = project.repositories.find((repo) => repo.syncError)?.syncError ?? null;
  const activity = asArray<number>(snapshot?.commitActivity);
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
    <article
      className={cn(
        "glass card-glow fade-up group relative overflow-hidden p-5",
        selected && "ring-1 ring-violet-400/60",
      )}
      style={
        {
          "--accent-from": accent.from,
          "--accent-to": accent.to,
          animationDelay: `${Math.min(index, 12) * 40}ms`,
        } as React.CSSProperties
      }
    >
      <span className="accent-bar absolute inset-x-0 top-0 h-[2px] opacity-70" aria-hidden="true" />

      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0 z-0 rounded-[var(--radius-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        aria-label={`Projekt ${project.name} oeffnen`}
      />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* Gedaempft, aber immer da. Nur beim Ueberfahren einzublenden
                  waere auf einem Touchgeraet gar nicht erreichbar – und wer
                  es nie sieht, weiss nicht, dass es die Auswahl gibt. */}
              {onToggleSelect ? (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onToggleSelect(project.id, event.target.checked)}
                  aria-label={`${project.name} auswaehlen`}
                  className={cn(
                    "pointer-events-auto h-3.5 w-3.5 shrink-0 accent-violet-500 transition-opacity",
                    !selected && "opacity-35 group-hover:opacity-100 focus-visible:opacity-100",
                  )}
                />
              ) : null}
              <h3 className="truncate text-base font-semibold text-white transition-colors group-hover:text-violet-200">
                {project.name}
              </h3>
              {favorite ? (
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" />
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 min-h-[2.4rem] text-sm leading-snug text-slate-400">
              {project.summary ? truncate(project.summary, 140) : "Noch keine Kurzbeschreibung."}
            </p>
          </div>

          <button
            type="button"
            onClick={toggleFavorite}
            aria-label={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
            className={cn(
              "pointer-events-auto shrink-0 rounded-lg p-1.5 transition-colors",
              favorite
                ? "text-amber-300 hover:bg-amber-400/10"
                : "text-slate-600 hover:bg-white/8 hover:text-amber-300 sm:opacity-0 sm:group-hover:opacity-100",
            )}
          >
            <Star className={cn("h-4 w-4", favorite && "fill-current")} />
          </button>
        </div>

        {/* Fortschritt */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Fortschritt</span>
            <span className="tabular-nums text-slate-400">{project.progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/6">
            <div
              className="accent-bar h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.max(2, project.progress)}%` }}
            />
          </div>
        </div>

        {/* Commit-Aktivitaet */}
        {activity.some((value) => value > 0) ? (
          <div className="mt-3">
            <Sparkline values={activity} height={20} />
          </div>
        ) : null}

        {/* Git-Kurzinfo */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-slate-400">
          <CiBadge state={snapshot?.ciState} name={snapshot?.ciName} compact />

          {leading?.connection ? (
            <span className="glass-soft inline-flex items-center gap-1.5 px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />
              {PROVIDER_LABEL[leading.connection.provider] ?? leading.connection.provider}
            </span>
          ) : null}

          {weitere > 0 ? (
            <span
              className="inline-flex items-center gap-1.5"
              title={project.repositories.map((repo) => repoTitle(repo)).join(", ")}
            >
              <GitBranch className="h-3.5 w-3.5 text-slate-500" />+{weitere} Repo
              {weitere === 1 ? "" : "s"}
            </span>
          ) : null}

          {snapshot?.defaultBranch ? (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <GitBranch className="h-3.5 w-3.5 text-slate-500" />
              {snapshot.defaultBranch}
              {snapshot.branchCount > 1 ? (
                <span className="text-slate-600">+{snapshot.branchCount - 1}</span>
              ) : null}
            </span>
          ) : null}

          {snapshot?.latestTag ? (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Tag className="h-3.5 w-3.5 text-slate-500" />
              {snapshot.latestTag}
            </span>
          ) : null}

          {snapshot?.lastCommitAt ? (
            <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
              <GitCommitHorizontal className="h-3.5 w-3.5 text-slate-500" />
              {formatRelative(snapshot.lastCommitAt)}
            </span>
          ) : null}

          {project._count.tasks > 0 ? (
            <span
              className="inline-flex items-center gap-1.5"
              title={`${project.tasks.length} von ${project._count.tasks} Aufgaben erledigt`}
            >
              <CheckSquare className="h-3.5 w-3.5 text-slate-500" />
              {project.tasks.length}/{project._count.tasks}
            </span>
          ) : null}

          {project._count.notes > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <NotebookPen className="h-3.5 w-3.5 text-slate-500" />
              {project._count.notes}
            </span>
          ) : null}

          {syncError ? (
            <span className="inline-flex items-center gap-1.5 text-rose-300/80" title={syncError}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Sync-Fehler
            </span>
          ) : null}
        </div>

        {/* Tags */}
        {project.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
              >
                #{tag}
              </span>
            ))}
            {project.tags.length > 4 ? (
              <span className="px-1 text-[10px] text-slate-600">+{project.tags.length - 4}</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/6 pt-3">
          <div className="pointer-events-auto">
            <StatusSelect projectId={project.id} status={project.status} variant="compact" />
          </div>
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: priority.color }}
            title={`Prioritaet: ${priority.label}`}
          >
            {priority.label}
          </span>
        </div>
      </div>
    </article>
  );
}
