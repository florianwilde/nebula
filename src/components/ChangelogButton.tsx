"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CHANGELOG, KIND_META } from "@/lib/changelog";
import { cn, formatDate } from "@/lib/utils";

/**
 * Die Versionsnummer in der Fusszeile oeffnet den Aenderungsverlauf.
 *
 * Kein eigener Menuepunkt: gesucht wird so etwas erfahrungsgemaess dort, wo
 * die Version steht – und einen Platz in der Navigation ist es nicht wert.
 */
export function ChangelogButton({ version }: { version: string }) {
  const [open, setOpen] = useState(false);
  const aktuell = CHANGELOG[0]?.version;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded font-mono text-slate-600 underline decoration-dotted underline-offset-4 transition-colors hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        title="Was ist neu?"
      >
        v{version}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="lg"
        title="Änderungsverlauf"
        description={
          // Ein Hinweis, falls die laufende Fassung neuer ist als der Eintrag.
          // Das passiert, wenn jemand die Version hochzaehlt und den Eintrag
          // vergisst – dann soll es auffallen statt still danebenzustehen.
          aktuell === version
            ? "Was in den letzten Fassungen dazugekommen ist."
            : `Diese Instanz läuft auf v${version}; der Verlauf endet bei v${aktuell}.`
        }
      >
        <ol className="space-y-7">
          {CHANGELOG.map((release) => (
            <li key={release.version}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-mono text-base font-semibold text-white">
                  v{release.version}
                </h3>
                {release.version === version ? (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">
                    installiert
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">{formatDate(release.date)}</span>
              </div>

              <p className="mt-1 text-sm text-slate-400">{release.headline}</p>

              <ul className="mt-3 space-y-2">
                {release.changes.map((change, index) => {
                  const meta = KIND_META[change.kind];
                  return (
                    <li key={index} className="flex gap-2.5 text-sm leading-snug text-slate-300">
                      <span
                        className={cn(
                          "mt-0.5 h-fit shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="min-w-0">{change.text}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </Modal>
    </>
  );
}
