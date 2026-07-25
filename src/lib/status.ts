import type { ProjectStatus } from "@prisma/client";

export type StatusMeta = {
  value: ProjectStatus;
  label: string;
  short: string;
  /** Tailwind-Klassen fuer Pills/Badges */
  className: string;
  /** Reine Farbe fuer Punkte, Balken und Glows */
  color: string;
  description: string;
};

export const STATUS_ORDER: ProjectStatus[] = [
  "IDEA",
  "PLANNING",
  "OPEN",
  "IN_DEVELOPMENT",
  "DONE",
  "ARCHIVED",
];

export const STATUS_META: Record<ProjectStatus, StatusMeta> = {
  IDEA: {
    value: "IDEA",
    label: "Idee",
    short: "Idee",
    className: "bg-cyan-500/12 text-cyan-200 ring-cyan-400/30",
    color: "#22d3ee",
    description: "Noch ein Gedanke – nichts gebaut, nichts entschieden.",
  },
  PLANNING: {
    value: "PLANNING",
    label: "In Planung",
    short: "Planung",
    className: "bg-blue-500/12 text-blue-200 ring-blue-400/30",
    color: "#60a5fa",
    description: "Scope, Stack und Schnitt werden gerade festgelegt.",
  },
  OPEN: {
    value: "OPEN",
    label: "Offen",
    short: "Offen",
    className: "bg-amber-500/12 text-amber-200 ring-amber-400/30",
    color: "#fbbf24",
    description: "Startklar, aber aktuell liegt es still.",
  },
  IN_DEVELOPMENT: {
    value: "IN_DEVELOPMENT",
    label: "In Entwicklung",
    short: "Aktiv",
    className: "bg-violet-500/12 text-violet-200 ring-violet-400/30",
    color: "#a78bfa",
    description: "Wird gerade aktiv gebaut.",
  },
  DONE: {
    value: "DONE",
    label: "Fertig",
    short: "Fertig",
    className: "bg-emerald-500/12 text-emerald-200 ring-emerald-400/30",
    color: "#34d399",
    description: "Ausgeliefert und abgeschlossen.",
  },
  ARCHIVED: {
    value: "ARCHIVED",
    label: "Archiviert",
    short: "Archiv",
    className: "bg-slate-500/12 text-slate-300 ring-slate-400/25",
    color: "#94a3b8",
    description: "Ruht im Archiv – bleibt erhalten, stoert aber nicht mehr.",
  },
};

export const PRIORITY_META: Record<number, { label: string; color: string }> = {
  1: { label: "Niedrig", color: "#64748b" },
  2: { label: "Normal", color: "#38bdf8" },
  3: { label: "Hoch", color: "#fb923c" },
  4: { label: "Kritisch", color: "#f43f5e" },
};

export type AccentKey = "violet" | "cyan" | "emerald" | "amber" | "rose" | "blue";

export const ACCENTS: Record<AccentKey, { label: string; from: string; to: string }> = {
  violet: { label: "Violett", from: "#8b5cf6", to: "#d946ef" },
  cyan: { label: "Cyan", from: "#06b6d4", to: "#3b82f6" },
  emerald: { label: "Smaragd", from: "#10b981", to: "#84cc16" },
  amber: { label: "Bernstein", from: "#f59e0b", to: "#f43f5e" },
  rose: { label: "Rose", from: "#f43f5e", to: "#8b5cf6" },
  blue: { label: "Blau", from: "#3b82f6", to: "#6366f1" },
};

export function accentOf(key: string | null | undefined) {
  return ACCENTS[(key ?? "violet") as AccentKey] ?? ACCENTS.violet;
}

export function statusOf(status: ProjectStatus | string): StatusMeta {
  return STATUS_META[status as ProjectStatus] ?? STATUS_META.IDEA;
}
