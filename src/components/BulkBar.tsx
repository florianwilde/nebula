"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Tag, Trash2, X } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { Popover } from "@/components/ui/Popover";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn, parseTags } from "@/lib/utils";

/**
 * Leiste fuer die Mehrfachauswahl. Erscheint erst, wenn etwas ausgewaehlt ist,
 * und liegt fest am unteren Rand – bei einer langen Liste waere sie oben
 * sonst laengst aus dem Blick gescrollt, waehrend man noch auswaehlt.
 */
export function BulkBar({
  ids,
  onDone,
  onClear,
}: {
  ids: string[];
  onDone: () => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const statusRef = useRef<HTMLButtonElement>(null);
  const tagsRef = useRef<HTMLButtonElement>(null);

  async function apply(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Das hat nicht geklappt.");
      onDone();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setStatusOpen(false);
      setTagsOpen(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `${ids.length} Projekt${ids.length === 1 ? "" : "e"} mit allen Notizen und Aufgaben ` +
          "unwiderruflich loeschen?",
      )
    ) {
      return;
    }
    await apply({ action: "delete" });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
      <div className="popover pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-2 shadow-2xl">
        <span className="px-1 text-sm tabular-nums text-slate-200">
          {ids.length} ausgewählt
        </span>

        <span className="h-5 w-px bg-white/10" aria-hidden />

        <button
          ref={statusRef}
          type="button"
          className="btn btn-ghost px-2.5 py-1.5 text-xs"
          onClick={() => setStatusOpen((value) => !value)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={statusOpen}
        >
          Status
        </button>
        <Popover
          open={statusOpen}
          anchorRef={statusRef}
          onClose={() => setStatusOpen(false)}
          align="start"
        >
          <div role="menu" className="min-w-[12rem] p-1">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 hover:bg-white/6"
                onClick={() => apply({ action: "status", status })}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_META[status].color }}
                />
                {STATUS_META[status].label}
              </button>
            ))}
          </div>
        </Popover>

        <button
          ref={tagsRef}
          type="button"
          className="btn btn-ghost px-2.5 py-1.5 text-xs"
          onClick={() => setTagsOpen((value) => !value)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={tagsOpen}
        >
          <Tag className="h-3.5 w-3.5" />
          Tags
        </button>
        <Popover open={tagsOpen} anchorRef={tagsRef} onClose={() => setTagsOpen(false)} align="start">
          <div className="w-64 space-y-2 p-3">
            <label className="field-label" htmlFor="bulk-tags">
              Tags (kommagetrennt)
            </label>
            <input
              id="bulk-tags"
              className="field"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="experiment, archiv"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1 px-2 py-1.5 text-xs"
                disabled={busy || parseTags(tagInput).length === 0}
                onClick={() =>
                  apply({ action: "tags", tags: parseTags(tagInput), tagMode: "add" })
                }
              >
                Hinzufügen
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-1 px-2 py-1.5 text-xs"
                disabled={busy || parseTags(tagInput).length === 0}
                onClick={() =>
                  apply({ action: "tags", tags: parseTags(tagInput), tagMode: "remove" })
                }
              >
                Entfernen
              </button>
            </div>
          </div>
        </Popover>

        <button
          type="button"
          className="btn btn-ghost px-2.5 py-1.5 text-xs"
          onClick={() => apply({ action: "favorite", favorite: true })}
          disabled={busy}
          title="Als Favoriten markieren"
        >
          <Star className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="btn btn-ghost px-2.5 py-1.5 text-xs text-rose-200"
          onClick={remove}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Löschen
        </button>

        {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}

        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1.5 text-slate-500 hover:text-white"
          aria-label="Auswahl aufheben"
        >
          <X className="h-4 w-4" />
        </button>

        {error ? (
          <p className={cn("w-full px-1 text-xs text-rose-300")}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}
