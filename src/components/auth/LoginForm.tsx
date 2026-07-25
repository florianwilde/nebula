"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Loader2, LogIn } from "lucide-react";

export function LoginForm({
  passkeysAvailable,
  registrationOpen,
  next,
}: {
  passkeysAvailable: boolean;
  registrationOpen: boolean;
  next: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "passkey" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function done() {
    // replace statt push: die Anmeldeseite soll nicht im Verlauf landen.
    router.replace(next);
    router.refresh();
  }

  async function loginWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy("password");
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Anmeldung fehlgeschlagen.");
      done();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  async function loginWithPasskey() {
    setBusy("passkey");
    setError(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const optionsPayload = await optionsResponse.json().catch(() => ({}));
      if (!optionsResponse.ok) {
        throw new Error(optionsPayload.error ?? "Passkey-Anmeldung nicht moeglich.");
      }

      const assertion = await startAuthentication({
        optionsJSON: optionsPayload.options,
      });

      const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: assertion }),
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) {
        throw new Error(verifyPayload.error ?? "Passkey wurde nicht akzeptiert.");
      }
      done();
    } catch (caught) {
      // Bricht der Benutzer den Systemdialog ab, ist das kein Fehler.
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(/abort|NotAllowed/i.test(message) ? null : message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {passkeysAvailable ? (
        <>
          <button
            type="button"
            onClick={loginWithPasskey}
            disabled={busy !== null}
            className="btn btn-ghost w-full py-2.5"
          >
            {busy === "passkey" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="h-4 w-4 text-violet-300" />
            )}
            Mit Passkey anmelden
          </button>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-600">
            <span className="h-px flex-1 bg-white/8" />
            oder
            <span className="h-px flex-1 bg-white/8" />
          </div>
        </>
      ) : null}

      <form onSubmit={loginWithPassword} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="login-username">
            Benutzername
          </label>
          <input
            id="login-username"
            className="field"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="field-label" htmlFor="login-password">
            Passwort
          </label>
          <input
            id="login-password"
            className="field"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy !== null}>
          {busy === "password" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          Anmelden
        </button>
      </form>

      {registrationOpen ? (
        <p className="text-center text-sm text-slate-500">
          Noch kein Konto?{" "}
          <Link href="/register" className="text-violet-300 hover:text-violet-200">
            Registrieren
          </Link>
        </p>
      ) : null}

      {!passkeysAvailable ? (
        <p className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/25 px-3 py-2 text-[11px] leading-snug text-slate-500">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Passkeys sind deaktiviert: Sie brauchen einen sicheren Kontext. Dafuer muss
            <code className="mx-1 text-violet-300">APP_URL</code>
            auf eine https-Adresse oder auf http://localhost zeigen.
          </span>
        </p>
      ) : null}
    </div>
  );
}
