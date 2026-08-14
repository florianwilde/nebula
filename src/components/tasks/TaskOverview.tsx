"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckSquare,
  ExternalLink,
  Loader2,
  Plus,
  Repeat,
  Square,
} from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { QuickCapture } from "@/components/QuickCapture";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import {
  DUE_BUCKET_META,
  DUE_BUCKET_ORDER,
  RECURRENCE_META,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
} from "@/lib/tasks";
import { cn, formatDate } from "@/lib/utils";
import type { TaskOverviewItem } from "@/types";

/** Wo Filter und Schalter im Browser liegen. */
const ANSICHT_SCHLUESSEL = "nebula.tasks";

/**
 * Aufgaben ueber alle Projekte hinweg.
 *
 * Geordnet wird nach Faelligkeit, nicht nach Spalte: projektuebergreifend
 * lautet die Frage "was ist ueberfaellig", nicht "was steht wo im Brett".
 * Aus demselben Grund laesst sich hier bewusst **nichts ziehen** – die
 * Position einer Aufgabe gilt innerhalb ihrer Spalte in ihrem Projekt und
 * waere hier ohne Bedeutung. Eine Reihenfolge anzubieten, die nirgends
 * ankommt, waere ein Versprechen, das die Seite nicht halten kann.
 */
export function TaskOverview({ tasks }: { tasks: TaskOverviewItem[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([]);
  const [projektFilter, setProjektFilter] = useState("");
  const [zeigeErledigte, setZeigeErledigte] = useState(false);
  const [erfassenOffen, setErfassenOffen] = useState(false);
  const [laufend, setLaufend] = useState<Set<string>>(new Set());
  /** Welche Aufgabe gerade im Dialog liegt. null heisst: keiner offen. */
  const [bearbeiten, setBearbeiten] = useState<TaskOverviewItem | null>(null);

  const projekte = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) map.set(task.project.id, task.project.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [tasks]);

  const zaehler = useMemo(() => {
    const map = new Map<TaskStatus, number>();
    for (const task of tasks) map.set(task.status, (map.get(task.status) ?? 0) + 1);
    return map;
  }, [tasks]);

  const sichtbar = useMemo(() => {
    return tasks.filter((task) => {
      // Erledigtes fuellt die Liste sonst mit dem, was gerade nicht ansteht.
      if (!zeigeErledigte && task.status === "DONE" && !statusFilter.includes("DONE")) {
        return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(task.status)) return false;
      if (projektFilter && task.project.id !== projektFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, projektFilter, zeigeErledigte]);

  const faecher = useMemo(() => {
    return DUE_BUCKET_ORDER.map((bucket) => ({
      bucket,
      items: sichtbar.filter((task) => task.bucket === bucket),
    })).filter((fach) => fach.items.length > 0);
  }, [sichtbar]);

  const offen = sichtbar.filter((task) => task.status !== "DONE").length;
  const ueberfaellig = sichtbar.filter(
    (task) => task.bucket === "overdue" && task.status !== "DONE",
  ).length;

  function toggleStatus(status: TaskStatus) {
    setStatusFilter((current) =>
      current.includes(status)
        ? current.filter((entry) => entry !== status)
        : [...current, status],
    );
  }

  /**
   * Abhaken direkt aus der Uebersicht. Der Endpunkt erledigt dabei den Rest:
   * doneAt, abgeleiteter Fortschritt und – bei wiederkehrenden Aufgaben –
   * die naechste Fassung.
   */
  async function abhaken(task: TaskOverviewItem) {
    const ziel: TaskStatus = task.status === "DONE" ? "TODO" : "DONE";
    setLaufend((current) => new Set(current).add(task.id));
    try {
      const antwort = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ziel }),
      });
      if (!antwort.ok) throw new Error("fehlgeschlagen");
      router.refresh();
    } catch {
      // Beim naechsten Laden steht wieder der echte Stand da.
    } finally {
      setLaufend((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-5">
      <header className="fade-up flex flex-wrap items-end justify-between gap-3 pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-300/70">
            Über alle Projekte
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Aufgaben
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {offen} offen
            {ueberfaellig > 0 ? (
              <>
                {" · "}
                <span className="text-rose-300">{ueberfaellig} überfällig</span>
              </>
            ) : null}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setErfassenOffen(true)}
          aria-label="Neue Aufgabe"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Neue Aufgabe</span>
        </button>
      </header>

      {/* Steuerleiste */}
      <div className="glass flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {TASK_STATUS_ORDER.map((status) => {
            const meta = TASK_STATUS_META[status];
            const aktiv = statusFilter.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={aktiv}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-all",
                  aktiv
                    ? meta.className
                    : "text-slate-400 ring-white/10 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta.color, opacity: aktiv ? 1 : 0.55 }}
                />
                {meta.label}
                <span className="tabular-nums text-slate-500">{zaehler.get(status) ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="task-project-filter">
            Projekt
          </label>
          <select
            id="task-project-filter"
            className="field w-auto min-w-0 sm:min-w-[14rem] sm:flex-none"
            value={projektFilter}
            onChange={(event) => setProjektFilter(event.target.value)}
          >
            <option value="">Alle Projekte</option>
            {projekte.map((projekt) => (
              <option key={projekt.id} value={projekt.id}>
                {projekt.name}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 sm:ml-auto">
            <input
              type="checkbox"
              checked={zeigeErledigte}
              onChange={(event) => setZeigeErledigte(event.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            Erledigte einblenden
          </label>
        </div>
      </div>

      {faecher.length === 0 ? (
        <div className="glass fade-up flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/20 text-violet-200">
            <CheckSquare className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {tasks.length === 0 ? "Noch keine Aufgaben" : "Nichts offen"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              {tasks.length === 0
                ? "Aufgaben entstehen im Projekt oder hier über „Neue Aufgabe“."
                : "Alles abgehakt, was zu den Filtern passt."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {faecher.map((fach) => {
            const meta = DUE_BUCKET_META[fach.bucket];
            return (
              <section key={fach.bucket}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span
                    className="accent-dot h-2 w-2 rounded-full"
                    style={{ backgroundColor: meta.color, color: meta.color }}
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                    {meta.label}
                  </h2>
                  <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
                    {fach.items.length}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>

                <ul className="glass divide-y divide-white/6 overflow-hidden">
                  {fach.items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      busy={laufend.has(task.id)}
                      onToggle={() => abhaken(task)}
                      onEdit={() => setBearbeiten(task)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <QuickCapture
        open={erfassenOffen}
        onClose={() => setErfassenOffen(false)}
        initialMode="aufgabe"
      />

      {/* Derselbe Dialog wie im Projektbrett – er kennt seine Aufgabe ueber
          die ID und braucht das Projekt nur zum Anlegen. */}
      {bearbeiten ? (
        <TaskDialog
          open
          projectId={bearbeiten.project.id}
          task={bearbeiten}
          initialStatus={bearbeiten.status}
          onClose={() => setBearbeiten(null)}
        />
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  busy,
  onToggle,
  onEdit,
}: {
  task: TaskOverviewItem;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const meta = TASK_STATUS_META[task.status];
  const erledigt = task.status === "DONE";

  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-white/4 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={erledigt ? `„${task.title}“ wieder öffnen` : `„${task.title}“ abhaken`}
        className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-emerald-300 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : erledigt ? (
          <CheckSquare className="h-4 w-4 text-emerald-300" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {/* Der Titel oeffnet den Bearbeiten-Dialog. Frueher fuehrte von
              hier nur der Weg ins Projekt – wer eine Faelligkeit aendern
              wollte, musste erst dorthin springen und die Aufgabe im Brett
              wiederfinden. */}
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              "truncate text-left text-sm transition-colors hover:text-violet-200",
              erledigt ? "text-slate-500 line-through" : "text-slate-100",
            )}
            title="Aufgabe bearbeiten"
          >
            {task.title}
          </button>
          {task.recurrence ? (
            <Repeat
              className="h-3 w-3 shrink-0 text-slate-500"
              aria-label={RECURRENCE_META[task.recurrence].label}
            />
          ) : null}
          {task.sourceUrl ? (
            <a
              href={task.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-slate-500 transition-colors hover:text-violet-300"
              aria-label="Zugehöriges Issue öffnen"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          {/* Das Projekt gehoert in jede Zeile – ohne es ist eine
              projektuebergreifende Liste nicht zu lesen. */}
          <Link
            href={`/projects/${task.project.id}`}
            className="max-w-[10rem] truncate text-slate-400 underline-offset-2 hover:text-violet-300 hover:underline"
          >
            {task.project.name}
          </Link>

          <span
            className={cn("inline-flex items-center gap-1 rounded-full px-1.5 ring-1 ring-inset", meta.className)}
          >
            {meta.label}
          </span>

          {task.dueDate ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1",
                task.bucket === "overdue" && !erledigt && "text-rose-300",
              )}
            >
              <CalendarClock className="h-3 w-3" />
              {formatDate(task.dueDate)}
            </span>
          ) : null}

          {task.labels.slice(0, 2).map((label) => (
            <span key={label} className="hidden rounded bg-white/5 px-1.5 text-slate-400 xs:inline">
              #{label}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
