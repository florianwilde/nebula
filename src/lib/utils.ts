/** Kleine Helfer ohne Abhaengigkeiten. */

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

const DATETIME_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "–";
  return DATE_FORMAT.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "–";
  return DATETIME_FORMAT.format(date);
}

/**
 * "vor 3 Tagen". Bewusst grob gerundet – kleine Abweichungen zwischen
 * Server-Render und Hydration fallen damit nicht auf.
 */
export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "nie";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "nie";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "gerade eben";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 31) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  const months = Math.round(days / 30);
  if (months < 12) return `vor ${months} Mon.`;
  return `vor ${Math.round(months / 12)} J.`;
}

export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function firstLine(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("\n")[0] ?? "";
}

export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE").format(value);
}
