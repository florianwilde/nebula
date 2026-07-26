"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Aus dem offenen Projekt eine Vorlage machen.
 *
 * Bewusst hier und nicht in einer eigenen Verwaltungsseite: Vorlagen
 * entstehen aus einem Projekt, das sich bewaehrt hat. Sie von Grund auf zu
 * tippen kann man ueber die API, taeglich braucht das niemand.
 */
export function SaveTemplateDialog({
  open,
  onClose,
  projectId,
  projectName,
  noteCount,
  taskCount,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  noteCount: number;
  taskCount: number;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [withNotes, setWithNotes] = useState(true);
  const [withTasks, setWithTasks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(projectName);
    setDescription("");
    setWithNotes(true);
    setWithTasks(true);
    setError(null);
    setDone(false);
  }, [open, projectName]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/templates/from-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name, description, withNotes, withTasks }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      setDone(true);
      // Kurz stehen lassen, damit die Bestaetigung ankommt.
      setTimeout(onClose, 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title="Als Vorlage sichern"
      description="Neue Projekte starten damit mit denselben Tags, Notizen und Aufgaben."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="template-name">
            Name der Vorlage *
          </label>
          <input
            id="template-name"
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="field-label" htmlFor="template-description">
            Wofür ist sie gut? (optional)
          </label>
          <input
            id="template-description"
            className="field"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="z. B. Kleine Web-App mit Docker und CI"
            maxLength={280}
          />
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={withNotes}
              onChange={(event) => setWithNotes(event.target.checked)}
              disabled={noteCount === 0}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              Notizen übernehmen
              <span className="mt-0.5 block text-[11px] text-slate-600">
                {noteCount === 0
                  ? "Dieses Projekt hat keine Notizen."
                  : `${noteCount} ${noteCount === 1 ? "Notiz" : "Notizen"}`}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={withTasks}
              onChange={(event) => setWithTasks(event.target.checked)}
              disabled={taskCount === 0}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              Aufgaben übernehmen
              <span className="mt-0.5 block text-[11px] text-slate-600">
                {taskCount === 0
                  ? "Dieses Projekt hat keine offenen Aufgaben."
                  : `${taskCount} offene ${taskCount === 1 ? "Aufgabe" : "Aufgaben"} — erledigte kommen nicht mit`}
              </span>
            </span>
          </label>
        </div>

        <p className="rounded-lg border border-white/8 bg-black/25 px-3 py-2 text-xs text-slate-500">
          Repositories gehen <strong>nicht</strong> mit. Eine Vorlage, die jedes neue Projekt
          an dasselbe Repository hängt, wäre eine Falle.
        </p>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || done}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : done ? (
              <Check className="h-4 w-4" />
            ) : (
              <BookmarkPlus className="h-4 w-4" />
            )}
            {done ? "Gesichert" : "Sichern"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
