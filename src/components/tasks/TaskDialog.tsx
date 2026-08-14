"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, GitPullRequestArrow, Loader2, Trash2 } from "lucide-react";
import type { Recurrence, TaskStatus } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { RECURRENCE_META, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/tasks";
import { cn, parseTags } from "@/lib/utils";

/**
 * Was der Dialog von einer Aufgabe tatsaechlich liest.
 *
 * Bewusst nicht der vollstaendige Prisma-Datensatz: die Aufgabenuebersicht
 * ueber alle Projekte reicht eine schlankere Fassung durch, in der das Datum
 * als Zeichenkette ankommt – ein Date ueberlebt den Weg vom Server zum
 * Browser nicht. Ein echtes Task erfuellt diese Form ebenfalls.
 */
export interface EditableTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | string | null;
  labels: string[];
  recurrence: Recurrence | null;
  /** Gesetzt, sobald die Aufgabe an einem Git-Issue haengt. */
  sourceIssue?: number | null;
  sourceUrl?: string | null;
}

/** Datum fuer <input type="date"> – ortszeitbezogen, nicht UTC. */
function toDateInput(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function TaskDialog({
  open,
  projectId,
  task,
  initialStatus,
  onClose,
}: {
  open: boolean;
  projectId: string;
  task: EditableTask | null;
  initialStatus: TaskStatus;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  const [recurrence, setRecurrence] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(task);

  /**
   * Legt zur Aufgabe ein Issue im verknuepften Repository an.
   *
   * Ausdruecklich per Knopf und nicht beim Speichern: was in ein fremdes
   * System geschrieben wird, soll jemand gewollt haben.
   */
  async function createIssue() {
    if (!task) return;
    setIssueBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Issue konnte nicht angelegt werden.");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIssueBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? initialStatus);
    setDueDate(toDateInput(task?.dueDate ?? null));
    setLabels(task?.labels.join(", ") ?? "");
    setRecurrence(task?.recurrence ?? "");
    setError(null);
  }, [open, task, initialStatus]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const body = {
      title,
      description,
      status,
      // Ohne Uhrzeit auf Mittag legen, damit Zeitzonenverschiebungen das
      // Datum nicht auf den Vortag ziehen.
      dueDate: dueDate ? `${dueDate}T12:00:00` : null,
      labels: parseTags(labels),
      recurrence: recurrence || null,
    };

    try {
      const response = await fetch(
        isEdit ? `/api/tasks/${task?.id}` : `/api/projects/${projectId}/tasks`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    if (!window.confirm(`Aufgabe „${task.title}“ loeschen?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Loeschen fehlgeschlagen.");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={isEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
      description={isEdit ? undefined : "Titel genuegt – alles andere ist optional."}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="task-title">
            Titel *
          </label>
          <input
            id="task-title"
            className="field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </div>

        <div>
          <span className="field-label">Spalte</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TASK_STATUS_ORDER.map((value) => {
              const meta = TASK_STATUS_META[value];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs transition-all",
                    status === value
                      ? "border-violet-400/60 bg-violet-500/12 text-white"
                      : "border-white/9 text-slate-400 hover:border-white/20",
                  )}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="task-description">
            Beschreibung
          </label>
          <textarea
            id="task-description"
            className="field min-h-24 resize-y font-mono text-[13px]"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Markdown wird dargestellt."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="task-due">
              Faellig am
            </label>
            <input
              id="task-due"
              className="field"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="task-labels">
              Labels (kommagetrennt)
            </label>
            <input
              id="task-labels"
              className="field"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              placeholder="bug, ui"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="task-recurrence">
              Wiederholung
            </label>
            <select
              id="task-recurrence"
              className="field"
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value)}
            >
              <option value="">– einmalig –</option>
              {(Object.keys(RECURRENCE_META) as Recurrence[]).map((key) => (
                <option key={key} value={key}>
                  {RECURRENCE_META[key].label}
                </option>
              ))}
            </select>
            {recurrence ? (
              <p className="mt-1 text-xs text-slate-500">
                Sobald die Aufgabe nach „Erledigt“ wandert, entsteht die nächste. Gerechnet
                wird vom Fälligkeitsdatum, nicht vom Abhaken — eine wöchentliche Aufgabe
                bleibt also auf ihrem Wochentag.
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        {/* Verknuepfung mit einem Git-Issue. Nur beim Bearbeiten – zu einer
            Aufgabe, die es noch nicht gibt, laesst sich keins anlegen. */}
        {isEdit ? (
          <div className="rounded-lg border border-white/8 bg-white/2 px-3 py-2.5">
            {task?.sourceUrl || task?.sourceIssue ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                <GitPullRequestArrow className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                Verknuepft mit
                {task.sourceUrl ? (
                  <a
                    href={task.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-violet-300 underline-offset-2 hover:underline"
                  >
                    Issue #{task.sourceIssue}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-slate-300">Issue #{task.sourceIssue}</span>
                )}
                <span className="w-full text-[11px] text-slate-500">
                  Erledigt schliesst das Issue, ein Zurueckziehen oeffnet es wieder.
                </span>
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  Noch nicht mit einem Issue verknuepft.
                </span>
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1.5 text-xs"
                  onClick={createIssue}
                  disabled={busy || issueBusy}
                >
                  {issueBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitPullRequestArrow className="h-3.5 w-3.5" />
                  )}
                  Als Issue anlegen
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          {isEdit ? (
            <button
              type="button"
              className="btn btn-danger px-3 py-1.5 text-xs"
              onClick={remove}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Loeschen
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
