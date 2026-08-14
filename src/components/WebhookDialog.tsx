"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Radio, Trash2 } from "lucide-react";
import type { GitProvider } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { formatRelative } from "@/lib/utils";

/**
 * Einrichtung des Webhooks fuer ein Repository.
 *
 * Der Haken wird im Git-System von Hand eingetragen. Ihn ueber die API
 * anzulegen waere machbar, verlangte aber Administrationsrechte am
 * Repository – deutlich mehr, als Nebula sonst braucht, und es waere ein
 * Recht, das die meisten Token gar nicht haben.
 *
 * Das Geheimnis ist genau einmal zu sehen: danach liegt nur noch die
 * verschluesselte Fassung in der Datenbank, wie bei den Zugangstoken.
 */

/** Wo der Haken im jeweiligen System einzutragen ist. */
const ANLEITUNG: Record<GitProvider, { pfad: string; ereignisse: string }> = {
  GITHUB: {
    pfad: "Settings → Webhooks → Add webhook",
    ereignisse: "Content type „application/json“, Events: Pushes und Issues",
  },
  GITEA: {
    pfad: "Einstellungen → Webhooks → Gitea",
    ereignisse: "Auslöser: Push und Issues",
  },
  GITLAB: {
    pfad: "Settings → Webhooks",
    ereignisse: "Trigger: Push events und Issues events",
  },
};

export function WebhookDialog({
  open,
  onClose,
  repositoryId,
  repositoryTitle,
  provider,
  eingerichtet,
  zuletzt,
}: {
  open: boolean;
  onClose: () => void;
  repositoryId: string;
  repositoryTitle: string;
  provider: GitProvider | null;
  eingerichtet: boolean;
  zuletzt: Date | string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [geheimnis, setGeheimnis] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);

  // Ohne Verbindung ist das System unbekannt. Dann lieber allgemein bleiben,
  // als eine Anleitung fuer das falsche zu zeigen.
  const anleitung = provider ? ANLEITUNG[provider] : null;

  async function erzeugen() {
    setBusy(true);
    setFehler(null);
    try {
      const antwort = await fetch(`/api/repositories/${repositoryId}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const nutzlast = await antwort.json().catch(() => ({}));
      if (!antwort.ok) throw new Error(nutzlast.error ?? "Fehlgeschlagen.");
      setGeheimnis(nutzlast.secret);
      setUrl(nutzlast.url);
      router.refresh();
    } catch (gefangen) {
      setFehler(gefangen instanceof Error ? gefangen.message : String(gefangen));
    } finally {
      setBusy(false);
    }
  }

  async function zuruecknehmen() {
    if (!window.confirm("Webhook zuruecknehmen? Eingehende Aufrufe werden dann abgewiesen.")) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/repositories/${repositoryId}/webhook`, { method: "DELETE" });
      setGeheimnis(null);
      setUrl(null);
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function kopieren(wert: string, was: string) {
    try {
      await navigator.clipboard.writeText(wert);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 2000);
    } catch {
      // Ohne Zwischenablage bleibt der Text zum Markieren stehen.
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title="Webhook einrichten"
      description={`Damit meldet ${repositoryTitle} Aenderungen sofort, statt auf den naechsten Abgleich zu warten.`}
    >
      <div className="space-y-4">
        {eingerichtet && !geheimnis ? (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm text-emerald-100">
              <Radio className="h-4 w-4 shrink-0" />
              Webhook ist eingerichtet.
            </p>
            <p className="mt-1 text-xs text-emerald-300/70" suppressHydrationWarning>
              {zuletzt
                ? `Zuletzt empfangen ${formatRelative(zuletzt)}.`
                : "Bisher ist noch kein Aufruf angekommen — der Haken im Git-System fehlt vermutlich noch."}
            </p>
          </div>
        ) : null}

        {geheimnis && url ? (
          <div className="space-y-3">
            <Feld label="URL" wert={url} kopiert={kopiert === "url"} onCopy={() => kopieren(url, "url")} />
            <Feld
              label="Geheimnis (Secret)"
              wert={geheimnis}
              kopiert={kopiert === "secret"}
              onCopy={() => kopieren(geheimnis, "secret")}
            />
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-200">
              Das Geheimnis ist <strong>jetzt zum einzigen Mal</strong> zu sehen. Danach liegt es
              nur noch verschluesselt in der Datenbank. Verloren? Dann hier ein neues erzeugen —
              das alte gilt dann nicht mehr.
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-white/8 bg-white/2 px-3 py-2.5 text-xs text-slate-400">
          <p className="font-semibold text-slate-300">Im Git-System eintragen</p>
          {anleitung ? (
            <>
              <p className="mt-1">{anleitung.pfad}</p>
              <p className="mt-0.5">{anleitung.ereignisse}</p>
            </>
          ) : (
            <p className="mt-1">
              In den Einstellungen des Repositories unter „Webhooks“, mit den Ausloesern
              Push und Issues. Ist eine Git-Verbindung hinterlegt, steht hier der genaue
              Pfad fuer das jeweilige System.
            </p>
          )}
          <p className="mt-2 text-slate-500">
            Nebula wertet nur Push und Issues aus. Alles andere wird angenommen und liegen
            gelassen — ein Fehler wuerde das Git-System sonst zum Wiederholen bringen.
          </p>
        </div>

        {fehler ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {fehler}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {eingerichtet ? (
            <button
              type="button"
              className="btn btn-danger px-3 py-1.5 text-xs"
              onClick={zuruecknehmen}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Zuruecknehmen
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {geheimnis ? "Fertig" : "Schliessen"}
            </button>
            <button type="button" className="btn btn-primary" onClick={erzeugen} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              {eingerichtet ? "Neues Geheimnis" : "Einrichten"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Feld({
  label,
  wert,
  kopiert,
  onCopy,
}: {
  label: string;
  wert: string;
  kopiert: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-2">
        {/* tabIndex: der Kasten scrollt seitlich und muss deshalb auch mit
            der Tastatur erreichbar sein – sonst kommt man an das Ende einer
            langen URL nur mit der Maus. */}
        <code
          tabIndex={0}
          className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/9 bg-[rgba(8,10,24,0.6)] px-3 py-2 font-mono text-xs text-slate-200"
        >
          {wert}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="btn btn-ghost shrink-0 px-2.5 py-2"
          aria-label={`${label} kopieren`}
        >
          {kopiert ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
