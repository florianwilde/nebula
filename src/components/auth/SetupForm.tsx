"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, User, Users } from "lucide-react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { cn } from "@/lib/utils";

type Mode = "SINGLE_USER" | "MULTI_USER";

const MODES: Array<{ value: Mode; label: string; hint: string; icon: typeof User }> = [
  {
    value: "SINGLE_USER",
    label: "Nur ich",
    hint: "Ein Konto, keine Registrierung, keine Benutzerliste.",
    icon: User,
  },
  {
    value: "MULTI_USER",
    label: "Mehrere Personen",
    hint: "Weitere Konten moeglich, jedes mit streng getrennten Daten.",
    icon: Users,
  },
];

export function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [mode, setMode] = useState<Mode>("SINGLE_USER");
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
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, email, password, mode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFieldErrors(payload.fields ?? {});
        throw new Error(payload.error ?? "Einrichtung fehlgeschlagen.");
      }
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <span className="field-label">Betriebsart</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((option) => {
            const Icon = option.icon;
            const active = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition-all",
                  active
                    ? "border-violet-400/60 bg-violet-500/12 shadow-[0_0_24px_-10px_rgba(139,92,246,0.9)]"
                    : "border-white/9 hover:border-white/20",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Icon className={cn("h-4 w-4", active ? "text-violet-300" : "text-slate-500")} />
                  {option.label}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Laesst sich spaeter in den Admin-Einstellungen umstellen.
        </p>
      </div>

      <div>
        <label className="field-label" htmlFor="setup-username">
          Benutzername *
        </label>
        <input
          id="setup-username"
          className="field"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="florian"
          required
          autoFocus
        />
        {fieldErrors.username ? (
          <p className="mt-1 text-xs text-rose-300">{fieldErrors.username}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="setup-display">
            Anzeigename
          </label>
          <input
            id="setup-display"
            className="field"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Florian"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="setup-email">
            E-Mail
          </label>
          <input
            id="setup-email"
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
        <label className="field-label" htmlFor="setup-password">
          Passwort *
        </label>
        <input
          id="setup-password"
          className="field"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Mindestens {PASSWORD_MIN_LENGTH} Zeichen. Einen Passkey kannst du danach unter
          „Mein Konto“ hinzufuegen.
        </p>
        {fieldErrors.password ? (
          <p className="mt-1 text-xs text-rose-300">{fieldErrors.password}</p>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="setup-repeat">
          Passwort wiederholen *
        </label>
        <input
          id="setup-repeat"
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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
        Einrichten und loslegen
      </button>
    </form>
  );
}
