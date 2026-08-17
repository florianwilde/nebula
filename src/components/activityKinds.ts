import {
  AlertTriangle,
  ArrowRight,
  Download,
  GitCommitHorizontal,
  Link2,
  NotebookPen,
  Pencil,
  Plus,
  Signpost,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ActivityKind } from "@prisma/client";

/**
 * Symbol und Farbe je Art eines Verlaufseintrags.
 *
 * Ausgelagert, weil sie inzwischen an zwei Stellen gebraucht werden: im
 * Verlauf eines Projekts und im Wochenrueckblick ueber alle Projekte. Zwei
 * Kopien liefen beim naechsten neuen Eintragstyp auseinander.
 *
 * Bewusst ohne "use client" und ohne Prisma-Zugriff – nur Typen und
 * Symbole, damit beide Seiten es importieren koennen.
 */
export const ACTIVITY_KINDS: Record<
  ActivityKind,
  { icon: typeof Sparkles; color: string; label: string }
> = {
  PROJECT_CREATED: { icon: Sparkles, color: "text-violet-300", label: "Projekt angelegt" },
  PROJECT_UPDATED: { icon: Pencil, color: "text-slate-400", label: "Projekt bearbeitet" },
  STATUS_CHANGED: { icon: Signpost, color: "text-cyan-300", label: "Status geändert" },
  NOTE_ADDED: { icon: NotebookPen, color: "text-blue-300", label: "Notiz" },
  NOTE_UPDATED: { icon: Pencil, color: "text-blue-300", label: "Notiz bearbeitet" },
  NOTE_DELETED: { icon: Trash2, color: "text-rose-300", label: "Notiz gelöscht" },
  TASK_ADDED: { icon: Plus, color: "text-emerald-300", label: "Aufgabe angelegt" },
  TASK_MOVED: { icon: ArrowRight, color: "text-violet-300", label: "Aufgabe verschoben" },
  TASK_DELETED: { icon: Trash2, color: "text-rose-300", label: "Aufgabe gelöscht" },
  TASKS_IMPORTED: { icon: Download, color: "text-amber-300", label: "Aufgaben übernommen" },
  REPO_LINKED: { icon: Link2, color: "text-cyan-300", label: "Repository verknüpft" },
  REPO_COMMITS: { icon: GitCommitHorizontal, color: "text-emerald-300", label: "Commits" },
  SYNC_FAILED: { icon: AlertTriangle, color: "text-rose-300", label: "Abgleich fehlgeschlagen" },
};
