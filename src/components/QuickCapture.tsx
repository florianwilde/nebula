"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Lightbulb, Loader2, Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

/**
 * Schnellerfassung: ein Feld, Enter, fertig.
 *
 * „Ideen festhalten" ist der erste Satz auf dem Dashboard – der Weg dorthin
 * fuehrte aber ueber einen Dialog mit sieben Feldern. Unterwegs auf dem
 * Telefon ist das der Unterschied zwischen „schreib ich schnell auf" und
 * „mach ich spaeter", und spaeter heisst gar nicht.
 *
 * Deshalb bleibt hier alles weg, was sich nachziehen laesst: Projekte
 * entstehen als Idee, Aufgaben als offen. Beschreibung, Status, Termin und
 * der ganze Rest kommen am Rechner dazu, wenn ueberhaupt.
 *
 * Der Dialog bleibt nach dem Anlegen offen und leert nur das Feld. Wer eine
 * Idee notiert, hat meistens gleich die naechste – ihn jedes Mal neu zu
 * oeffnen waere genau die Huerde, die hier wegsoll.
 */

interface ProjektHit {
  id: string;
  name: string;
}

/** Zuletzt gewaehltes Projekt, damit die Aufgabenerfassung nicht jedes Mal fragt. */
const PROJEKT_SCHLUESSEL = "nebula.quickcapture.projekt";

type Modus = "idee" | "aufgabe";

interface Angelegt {
  art: Modus;
  titel: string;
  href: string;
}

export function QuickCapture({
  open,
  onClose,
  initialMode = "idee",
}: {
  open: boolean;
  onClose: () => void;
  /** Aus der Aufgabenuebersicht heraus faengt der Dialog bei "aufgabe" an. */
  initialMode?: Modus;
}) {
  const router = useRouter();
  const eingabeRef = useRef<HTMLInputElement>(null);

  const [modus, setModus] = useState<Modus>(initialMode);
  const [titel, setTitel] = useState("");
  const [projekte, setProjekte] = useState<ProjektHit[]>([]);
  const [projektId, setProjektId] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [angelegt, setAngelegt] = useState<Angelegt[]>([]);

  // Beim Oeffnen zuruecksetzen – ein Dialog, der noch die Eingabe von
  // vorgestern zeigt, ist schlimmer als einer, der leer ist.
  useEffect(() => {
    if (!open) return;
    setTitel("");
    setFehler(null);
    setAngelegt([]);
    setModus(initialMode);
  }, [open, initialMode]);

  /**
   * Die Projektliste wird erst gebraucht, wenn jemand eine Aufgabe erfasst.
   * Sie beim Oeffnen zu holen waere eine Abfrage fuer den haeufigeren Fall,
   * in dem sie niemand ansieht.
   */
  useEffect(() => {
    if (!open || modus !== "aufgabe" || projekte.length > 0) return;

    let abgebrochen = false;
    (async () => {
      try {
        const antwort = await fetch("/api/projects");
        if (!antwort.ok) return;
        const daten = (await antwort.json()) as { projects?: ProjektHit[] };
        if (abgebrochen) return;

        const liste = (daten.projects ?? []).map(({ id, name }) => ({ id, name }));
        setProjekte(liste);

        const gemerkt = window.localStorage.getItem(PROJEKT_SCHLUESSEL);
        const gueltig = gemerkt && liste.some((eintrag) => eintrag.id === gemerkt);
        setProjektId(gueltig ? gemerkt : (liste[0]?.id ?? ""));
      } catch {
        // Ohne Liste bleibt der Waehler leer; der Hinweis darunter erklaert es.
      }
    })();

    return () => {
      abgebrochen = true;
    };
  }, [open, modus, projekte.length]);

  async function absenden(event: React.FormEvent) {
    event.preventDefault();
    const wert = titel.trim();
    if (!wert || busy) return;

    setBusy(true);
    setFehler(null);

    try {
      if (modus === "idee") {
        const antwort = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Nur der Name. Alles andere setzt das Schema: Status IDEA,
          // Prioritaet normal, Fortschritt 0.
          body: JSON.stringify({ name: wert }),
        });
        const nutzlast = await antwort.json().catch(() => ({}));
        if (!antwort.ok) throw new Error(nutzlast.error ?? "Anlegen fehlgeschlagen.");

        setAngelegt((bisher) => [
          { art: "idee", titel: wert, href: `/projects/${nutzlast.project.id}` },
          ...bisher,
        ]);
      } else {
        if (!projektId) throw new Error("Kein Projekt gewaehlt.");
        const antwort = await fetch(`/api/projects/${projektId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: wert }),
        });
        const nutzlast = await antwort.json().catch(() => ({}));
        if (!antwort.ok) throw new Error(nutzlast.error ?? "Anlegen fehlgeschlagen.");

        window.localStorage.setItem(PROJEKT_SCHLUESSEL, projektId);
        setAngelegt((bisher) => [
          { art: "aufgabe", titel: wert, href: `/projects/${projektId}` },
          ...bisher,
        ]);
      }

      setTitel("");
      eingabeRef.current?.focus();
      router.refresh();
    } catch (gefangen) {
      setFehler(gefangen instanceof Error ? gefangen.message : String(gefangen));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title="Schnell erfassen"
      description="Ein Feld genuegt. Beschreibung, Status und Termin lassen sich spaeter nachziehen."
    >
      <form onSubmit={absenden} className="space-y-4">
        <div className="flex overflow-hidden rounded-xl border border-white/9" role="group">
          {(
            [
              { wert: "idee", label: "Idee", hinweis: "Neues Projekt", icon: Lightbulb },
              { wert: "aufgabe", label: "Aufgabe", hinweis: "In einem Projekt", icon: CheckSquare },
            ] as const
          ).map(({ wert, label, hinweis, icon: Icon }) => (
            <button
              key={wert}
              type="button"
              onClick={() => setModus(wert)}
              aria-pressed={modus === wert}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm transition-colors",
                modus === wert ? "bg-white/10 text-white" : "text-slate-400 hover:text-white",
              )}
              title={hinweis}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="field-label" htmlFor="quick-title">
            {modus === "idee" ? "Wie heisst die Idee?" : "Was ist zu tun?"}
          </label>
          <input
            id="quick-title"
            ref={eingabeRef}
            className="field"
            value={titel}
            onChange={(event) => setTitel(event.target.value)}
            placeholder={modus === "idee" ? "z. B. Pixelgarten" : "z. B. Favicon austauschen"}
            maxLength={modus === "idee" ? 120 : 200}
            required
            autoFocus
            // enterKeyHint stellt auf dem Telefon die Absendetaste um – sonst
            // steht dort „Weiter", obwohl es nichts weiter gibt.
            enterKeyHint="done"
          />
        </div>

        {modus === "aufgabe" ? (
          <div>
            <label className="field-label" htmlFor="quick-project">
              Projekt
            </label>
            {projekte.length > 0 ? (
              <select
                id="quick-project"
                className="field"
                value={projektId}
                onChange={(event) => setProjektId(event.target.value)}
              >
                {projekte.map((projekt) => (
                  <option key={projekt.id} value={projekt.id}>
                    {projekt.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-500">
                Noch kein Projekt vorhanden – leg zuerst eine Idee an.
              </p>
            )}
          </div>
        ) : null}

        {fehler ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {fehler}
          </p>
        ) : null}

        {angelegt.length > 0 ? (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">
              Angelegt
            </p>
            <ul className="mt-1 space-y-0.5">
              {angelegt.slice(0, 5).map((eintrag, index) => (
                <li key={`${eintrag.href}-${index}`} className="truncate text-sm">
                  <Link
                    href={eintrag.href}
                    onClick={onClose}
                    className="text-emerald-100 underline-offset-2 hover:underline"
                  >
                    {eintrag.titel}
                  </Link>
                  <span className="ml-1.5 text-[11px] text-emerald-300/60">
                    {eintrag.art === "idee" ? "Projekt" : "Aufgabe"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {angelegt.length > 0 ? "Fertig" : "Abbrechen"}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !titel.trim() || (modus === "aufgabe" && !projektId)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Anlegen
          </button>
        </div>
      </form>
    </Modal>
  );
}
