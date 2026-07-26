"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Zwei-Faktor-Anmeldung per Einmalkennwort.
 *
 * Die Einrichtung ist bewusst zweistufig: erst der QR-Code, dann ein Code zur
 * Bestaetigung. Scharf wird der Schluessel erst danach – sonst waere jemand,
 * der den QR-Code nicht scannen konnte, beim naechsten Anmelden ausgesperrt.
 */

export interface TotpState {
  enabled: boolean;
  enabledAt: string | Date | null;
  recoveryCodesLeft: number;
}

type Notice = { ok: boolean; text: string } | null;

export function TotpSection({
  state,
  hasPassword,
}: {
  state: TotpState;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // Einrichtung
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  // Wird genau einmal angezeigt, direkt nach dem Erzeugen.
  const [codes, setCodes] = useState<string[] | null>(null);

  // Abschalten und Neuerzeugen verlangen beides das Passwort.
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState<"disable" | "recovery" | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Das hat nicht geklappt.");
    return payload;
  }

  async function start() {
    setBusy(true);
    setNotice(null);
    try {
      const payload = await call("/api/account/totp", "POST");
      setSetup({ qr: payload.qr, secret: payload.secret });
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const payload = await call("/api/account/totp", "PUT", { code });
      setSetup(null);
      setCode("");
      setCodes(payload.recoveryCodes);
      router.refresh();
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (confirming === "disable") {
        await call("/api/account/totp", "DELETE", { password });
        setNotice({ ok: true, text: "Die Zwei-Faktor-Anmeldung ist abgeschaltet." });
        setCodes(null);
      } else {
        const payload = await call("/api/account/totp/recovery", "POST", { password });
        setCodes(payload.recoveryCodes);
        setNotice({ ok: true, text: "Neue Codes erzeugt. Die alten gelten nicht mehr." });
      }
      setConfirming(null);
      setPassword("");
      router.refresh();
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass p-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            state.enabled
              ? "bg-emerald-500/12 text-emerald-300"
              : "bg-violet-500/12 text-violet-300",
          )}
        >
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Zwei-Faktor-Anmeldung
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {state.enabled
              ? `Aktiv seit ${formatDateTime(state.enabledAt)}. Nach dem Passwort fragt die Anmeldung nach einem Code.`
              : "Ein zeitbasiertes Einmalkennwort zusätzlich zum Passwort — aus einer Authenticator-App."}
          </p>
        </div>
      </div>

      {!hasPassword ? (
        <p className="rounded-lg border border-white/8 bg-black/25 px-3 py-2 text-sm text-slate-400">
          Dieses Konto hat kein Passwort und meldet sich per Passkey an. Ein zweiter Faktor
          käme dabei nie zum Einsatz — der Passkey ist bereits an dein Gerät gebunden.
        </p>
      ) : null}

      {/* Frisch erzeugte Wiederherstellungscodes, einmalige Anzeige. */}
      {codes ? <RecoveryCodes codes={codes} onDone={() => setCodes(null)} /> : null}

      {hasPassword && !state.enabled && !setup && !codes ? (
        <button type="button" onClick={start} disabled={busy} className="btn btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          Einrichten
        </button>
      ) : null}

      {/* Schritt 1: QR-Code scannen, Schritt 2: Code bestaetigen. */}
      {setup ? (
        <form onSubmit={confirm} className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URI, kein Netzabruf */}
            <img
              src={setup.qr}
              alt="QR-Code für die Authenticator-App"
              width={160}
              height={160}
              className="shrink-0 rounded-xl bg-white p-2"
            />
            <div className="min-w-0 space-y-2 text-sm text-slate-400">
              <p>
                Scanne den Code mit deiner Authenticator-App — etwa Aegis, 2FAS, Ente Auth
                oder dem Passwortmanager deiner Wahl.
              </p>
              <p>Geht die Kamera nicht, trage den Schlüssel von Hand ein:</p>
              <code className="block break-all rounded-lg border border-white/8 bg-black/30 px-3 py-2 font-mono text-xs text-violet-200">
                {setup.secret}
              </code>
            </div>
          </div>

          <div className="max-w-xs">
            <label className="field-label" htmlFor="totp-code">
              Code aus der App
            </label>
            <input
              id="totp-code"
              className="field text-center text-lg tracking-[0.35em]"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Aktivieren
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSetup(null);
                setCode("");
                setNotice(null);
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      {state.enabled && !setup ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            {state.recoveryCodesLeft > 0 ? (
              <>
                Noch <strong className="text-slate-200">{state.recoveryCodesLeft}</strong>{" "}
                Wiederherstellungscodes übrig.
              </>
            ) : (
              <span className="text-amber-200">
                Keine Wiederherstellungscodes mehr übrig. Ohne sie hilft bei einem verlorenen
                Gerät nichts mehr — bitte neue erzeugen.
              </span>
            )}
          </p>

          {confirming ? (
            <form onSubmit={submitPassword} className="max-w-sm space-y-3">
              <div>
                <label className="field-label" htmlFor="totp-password">
                  Passwort bestätigen
                </label>
                <input
                  id="totp-password"
                  className="field"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className={cn("btn", confirming === "disable" ? "btn-danger" : "btn-primary")}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {confirming === "disable" ? "Abschalten" : "Neue Codes erzeugen"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setConfirming(null);
                    setPassword("");
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirming("recovery")}
              >
                <RefreshCw className="h-4 w-4" />
                Neue Wiederherstellungscodes
              </button>
              <button
                type="button"
                className="btn btn-ghost text-rose-200"
                onClick={() => setConfirming("disable")}
              >
                <ShieldOff className="h-4 w-4" />
                Abschalten
              </button>
            </div>
          )}
        </div>
      ) : null}

      {notice ? (
        <p
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm",
            notice.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Die Codes werden nur dieses eine Mal gezeigt. Deshalb Kopieren und
 * Herunterladen direkt daneben – und ein Knopf, der das Wegklicken zu einer
 * bewussten Handlung macht.
 */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ohne Zwischenablage-Recht bleibt Markieren von Hand.
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nebula-wiederherstellungscodes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
      <h3 className="text-sm font-semibold text-amber-100">Wiederherstellungscodes</h3>
      <p className="mt-1 text-sm text-amber-200/80">
        Jeder Code gilt einmal. Bewahre sie an einem sicheren Ort auf — sie sind der einzige
        Weg zurück, wenn dein Gerät verloren geht. <strong>Sie werden nur jetzt angezeigt.</strong>
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm text-amber-50 sm:grid-cols-2">
        {codes.map((entry) => (
          <li key={entry} className="rounded-md bg-black/25 px-2.5 py-1.5">
            {entry}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost text-xs">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Kopiert" : "Kopieren"}
        </button>
        <button type="button" onClick={download} className="btn btn-ghost text-xs">
          <Download className="h-3.5 w-3.5" />
          Herunterladen
        </button>
        <button type="button" onClick={onDone} className="btn btn-ghost text-xs">
          Ich habe sie gesichert
        </button>
      </div>
    </div>
  );
}
