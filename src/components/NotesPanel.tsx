"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, NotebookPen, Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import type { Note } from "@prisma/client";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

/** Nur als "bearbeitet" zaehlen, wenn wirklich spaeter geaendert wurde. */
function wasEdited(note: Note): boolean {
  const created = new Date(note.createdAt).getTime();
  const updated = new Date(note.updatedAt).getTime();
  return updated - created > 1500;
}

export function NotesPanel({ projectId, notes }: { projectId: string; notes: Note[] }) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function resetComposer() {
    setTitle("");
    setContent("");
    setEditingId(null);
    setComposerOpen(false);
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        editingId ? `/api/notes/${editingId}` : `/api/projects/${projectId}/notes`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      }
      resetComposer();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(note: Note) {
    setBusyId(note.id);
    await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !note.pinned }),
    }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  async function remove(note: Note) {
    if (!window.confirm("Notiz wirklich loeschen?")) return;
    setBusyId(note.id);
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title ?? "");
    setContent(note.content);
    setComposerOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
          <NotebookPen className="h-4 w-4 text-violet-300" />
          Notizen
          <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
            {notes.length}
          </span>
        </h2>
        {!composerOpen ? (
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setComposerOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Notiz
          </button>
        ) : null}
      </div>

      {composerOpen ? (
        <form onSubmit={save} className="glass fade-up space-y-3 p-4">
          <input
            className="field"
            placeholder="Titel (optional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
          />
          <textarea
            className="field min-h-32 resize-y font-mono text-[13px] leading-relaxed"
            placeholder="Gedanken, Todos, Snippets… Zeilenumbrueche bleiben erhalten."
            value={content}
            onChange={(event) => setContent(event.target.value)}
            autoFocus
            required
          />
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={resetComposer}>
              <X className="h-4 w-4" />
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !content.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Aktualisieren" : "Speichern"}
            </button>
          </div>
        </form>
      ) : null}

      {notes.length === 0 && !composerOpen ? (
        <div className="glass-soft px-4 py-10 text-center text-sm text-slate-500">
          Noch keine Notizen. Halte fest, was dir zu diesem Projekt durch den Kopf geht.
        </div>
      ) : null}

      <div className="space-y-3">
        {notes.map((note) => (
          <article
            key={note.id}
            className={cn(
              "glass group relative p-4 transition-colors",
              note.pinned && "ring-1 ring-inset ring-amber-400/25",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {note.title ? (
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                    {note.pinned ? <Pin className="h-3.5 w-3.5 text-amber-300" /> : null}
                    {note.title}
                  </h3>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                  {note.content}
                </p>
                <p className="mt-2.5 text-[11px] text-slate-600" suppressHydrationWarning>
                  {formatDateTime(note.createdAt)}
                  {wasEdited(note) ? ` · bearbeitet ${formatRelative(note.updatedAt)}` : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                {busyId === note.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => togglePin(note)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/8 hover:text-amber-300"
                      aria-label={note.pinned ? "Loesen" : "Anpinnen"}
                      title={note.pinned ? "Loesen" : "Anpinnen"}
                    >
                      {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/8 hover:text-violet-300"
                      aria-label="Bearbeiten"
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(note)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/12 hover:text-rose-300"
                      aria-label="Loeschen"
                      title="Loeschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
