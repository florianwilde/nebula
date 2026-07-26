"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { Task, TaskStatus } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/tasks";
import { cn, parseTags } from "@/lib/utils";

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
  task: Task | null;
  initialStatus: TaskStatus;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(task);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? initialStatus);
    setDueDate(toDateInput(task?.dueDate ?? null));
    setLabels(task?.labels.join(", ") ?? "");
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
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
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
