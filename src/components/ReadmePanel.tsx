"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";

/**
 * Das README des verknuepften Repositories.
 *
 * Erspart den Wechsel ins Git, nur um zu sehen, worum ein halbvergessenes
 * Projekt eigentlich ging. Nicht zum Lesen ganzer Handbuecher gedacht:
 * eingeklappt zeigt es die ersten Zeilen, ausgeklappt alles.
 */
export function ReadmePanel({
  content,
  path,
  baseUrl,
  fileUrl,
}: {
  content: string;
  path: string | null;
  baseUrl: string | null;
  /** Direktlink auf die Datei im Git-System. */
  fileUrl: string | null;
}) {
  const [offen, setOffen] = useState(false);

  // Kurze READMEs vollstaendig zu zeigen ist einfacher, als sie mit einem
  // Knopf zu versehen, der nichts freigibt.
  const kurz = content.length < 900;

  return (
    <section className="glass p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
          <BookOpen className="h-4 w-4 text-cyan-300" />
          {path ?? "README"}
        </h2>
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-violet-300"
          >
            Im Git öffnen
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      <div className="relative">
        <div
          className={cn(
            "overflow-hidden transition-[max-height] duration-300",
            !kurz && !offen && "max-h-72",
          )}
        >
          <Markdown baseUrl={baseUrl}>{content}</Markdown>
        </div>

        {/* Verlauf ueber den abgeschnittenen Rand, damit erkennbar ist, dass
            es weitergeht. Nur wenn wirklich etwas verdeckt wird. */}
        {!kurz && !offen ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0d1c] to-transparent"
          />
        ) : null}
      </div>

      {!kurz ? (
        <button
          type="button"
          onClick={() => setOffen((wert) => !wert)}
          className="btn btn-ghost mt-2 w-full text-xs"
          aria-expanded={offen}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", offen && "rotate-180")} />
          {offen ? "Weniger" : "Ganzes README anzeigen"}
        </button>
      ) : null}
    </section>
  );
}
