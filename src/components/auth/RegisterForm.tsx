"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

export function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== repeat) {
      setFieldErrors({ repeat: "Die Passwoerter stimmen nicht ueberein." });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFieldErrors(payload.fields ?? {});
        throw new Error(payload.error ?? "Registrierung fehlgeschlagen.");
      }
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="register-username">
          Benutzername *
        </label>
        <input
          id="register-username"
          className="field"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
        {fieldErrors.username ? (
          <p className="mt-1 text-xs text-rose-300">{fieldErrors.username}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="register-display">
            Anzeigename
          </label>
          <input
            id="register-display"
            className="field"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="register-email">
            E-Mail
          </label>
          <input
            id="register-email"
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="optional"
          />
          {fieldErrors.email ? (
            <p className="mt-1 text-xs text-rose-300">{fieldErrors.email}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="register-password">
          Passwort *
        </label>
        <input
          id="register-password"
          className="field"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
        />
        {fieldErrors.password ? (
          <p className="mt-1 text-xs text-rose-300">{fieldErrors.password}</p>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="register-repeat">
          Passwort wiederholen *
        </label>
        <input
          id="register-repeat"
          className="field"
          type="password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          autoComplete="new-password"
          required
        />
        {fieldErrors.repeat ? (
          <p className="mt-1 text-xs text-rose-300">{fieldErrors.repeat}</p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Konto anlegen
      </button>

      <p className="text-center text-sm text-slate-500">
        Schon ein Konto?{" "}
        <Link href="/login" className="text-violet-300 hover:text-violet-200">
          Anmelden
        </Link>
      </p>
    </form>
  );
}
