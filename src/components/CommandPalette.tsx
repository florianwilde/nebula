"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckSquare,
  CornerDownLeft,
  GitBranch,
  LayoutDashboard,
  Loader2,
  NotebookPen,
  Plus,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { statusOf } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Schnellsuche, zu erreichen mit Strg+K beziehungsweise Cmd+K.
 *
 * Springt zu einem Projekt, zu einer Notiz oder direkt in einen Bereich.
 * Die Projektliste wird beim ersten Oeffnen geholt und dann behalten – sie
 * bei jedem Tastendruck neu zu laden waere Verschwendung, und veraltet ist
 * sie hoechstens um die Dauer einer Sitzung.
 */

interface ProjectHit {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  status: ProjectStatus;
  tags: string[];
}

interface NoteHit {
  projectId: string;
  noteId: string;
  title: string | null;
  snippet: string;
}

interface Action {
  id: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  href: string;
  adminOnly?: boolean;
}

const ACTIONS: Action[] = [
  { id: "dashboard", label: "Dashboard", hint: "Alle Projekte", icon: LayoutDashboard, href: "/" },
  {
    id: "tasks",
    label: "Aufgaben",
    hint: "Über alle Projekte, nach Fälligkeit",
    icon: CheckSquare,
    href: "/tasks",
  },
  {
    id: "connections",
    label: "Git-Verbindungen",
    hint: "GitHub, GitLab, Gitea",
    icon: GitBranch,
    href: "/connections",
  },
  { id: "account", label: "Mein Konto", hint: "Profil, Passkeys", icon: UserRound, href: "/account" },
  {
    id: "notify",
    label: "Benachrichtigungen",
    hint: "Ziele verwalten",
    icon: Bell,
    href: "/account",
  },
  {
    id: "admin",
    label: "Admin-Einstellungen",
    hint: "Betriebsart, Abgleich, Konten",
    icon: Settings,
    href: "/admin",
    adminOnly: true,
  },
];

type Entry =
  | { kind: "action"; key: string; action: Action }
  | { kind: "project"; key: string; project: ProjectHit }
  | { kind: "note"; key: string; note: NoteHit; projectName: string };

export function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectHit[] | null>(null);
  const [notes, setNotes] = useState<NoteHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Strg+K oeffnet, Escape schliesst. In Eingabefeldern nicht stoeren –
  // ausser beim Kuerzel selbst, das soll ueberall greifen.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Projektliste beim ersten Oeffnen holen.
  useEffect(() => {
    if (!open || projects !== null) return;
    setLoading(true);
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((body) => setProjects(body.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open, projects]);

  // Notizen sucht der Server – entprellt, wie im Board.
  useEffect(() => {
    if (!open) return;
    const needle = query.trim();
    if (needle.length < 2) {
      setNotes([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { hits: NoteHit[] };
        setNotes(body.hits ?? []);
      } catch {
        // Abbruch beim Weitertippen ist der Normalfall.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setNotes([]);
      setActive(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.toLowerCase().trim();
    const result: Entry[] = [];

    const passendeAktionen = ACTIONS.filter(
      (action) =>
        (!action.adminOnly || isAdmin) &&
        (!needle ||
          action.label.toLowerCase().includes(needle) ||
          action.hint.toLowerCase().includes(needle)),
    );

    const passendeProjekte = (projects ?? []).filter(
      (project) =>
        !needle ||
        project.name.toLowerCase().includes(needle) ||
        (project.summary ?? "").toLowerCase().includes(needle) ||
        project.tags.some((tag) => tag.includes(needle)),
    );

    // Bei leerer Eingabe stehen die Projekte oben – danach sucht man
    // normalerweise.
    if (!needle) {
      for (const project of passendeProjekte.slice(0, 6)) {
        result.push({ kind: "project", key: `p-${project.id}`, project });
      }
      for (const action of passendeAktionen) {
        result.push({ kind: "action", key: `a-${action.id}`, action });
      }
      return result;
    }

    for (const project of passendeProjekte.slice(0, 8)) {
      result.push({ kind: "project", key: `p-${project.id}`, project });
    }
    for (const hit of notes.slice(0, 5)) {
      result.push({
        kind: "note",
        key: `n-${hit.noteId}`,
        note: hit,
        projectName:
          (projects ?? []).find((project) => project.id === hit.projectId)?.name ?? "Projekt",
      });
    }
    for (const action of passendeAktionen) {
      result.push({ kind: "action", key: `a-${action.id}`, action });
    }
    return result;
  }, [query, projects, notes, isAdmin]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  const go = useCallback(
    (entry: Entry) => {
      setOpen(false);
      if (entry.kind === "action") router.push(entry.action.href);
      else if (entry.kind === "project") router.push(`/projects/${entry.project.id}`);
      else router.push(`/projects/${entry.note.projectId}`);
    },
    [router],
  );

  function onInputKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % Math.max(1, entries.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + entries.length) % Math.max(1, entries.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = entries[active];
      if (entry) go(entry);
    }
  }

  // Ausgewaehlten Eintrag im Blick behalten.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Schnellsuche schliessen"
        onClick={() => setOpen(false)}
        className="fixed inset-0 cursor-default bg-[#03040c]/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schnellsuche"
        className="popover fade-up relative z-10 w-full max-w-xl overflow-hidden rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder="Projekt, Notiz oder Bereich…"
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" /> : null}
        </div>

        <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              {loading ? "Lade…" : "Nichts gefunden."}
            </p>
          ) : (
            entries.map((entry, index) => (
              <button
                key={entry.key}
                type="button"
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => go(entry)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  index === active ? "bg-white/8" : "hover:bg-white/5",
                )}
              >
                {entry.kind === "action" ? (
                  <>
                    <entry.action.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-200">
                        {entry.action.label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {entry.action.hint}
                      </span>
                    </span>
                  </>
                ) : entry.kind === "project" ? (
                  <>
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: statusOf(entry.project.status).color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">
                        {entry.project.name}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {entry.project.summary ?? statusOf(entry.project.status).label}
                      </span>
                    </span>
                    <span className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wider text-slate-600">
                      {statusOf(entry.project.status).short}
                    </span>
                  </>
                ) : (
                  <>
                    <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-violet-300/70" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-200">
                        {entry.note.title ?? "Notiz"}
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          in {entry.projectName}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {entry.note.snippet.replace(/\[\[|\]\]/g, "")}
                      </span>
                    </span>
                  </>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/6 px-4 py-2 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            waehlen
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>
              <CornerDownLeft className="h-2.5 w-2.5" />
            </Kbd>
            oeffnen
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd>
            schliessen
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Plus className="h-2.5 w-2.5" />
            <Kbd>Strg</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.2rem] items-center justify-center rounded border border-white/12 bg-white/5 px-1 py-0.5 font-sans text-[10px] text-slate-400">
      {children}
    </kbd>
  );
}
