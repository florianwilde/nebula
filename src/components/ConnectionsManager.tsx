"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import type { GitProvider } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { PROVIDER_META } from "@/lib/git/meta";
import { cn, formatRelative } from "@/lib/utils";
import type { ConnectionWithCount } from "@/types";

const PROVIDERS: GitProvider[] = ["GITHUB", "GITLAB", "GITEA"];

interface FormState {
  name: string;
  provider: GitProvider;
  baseUrl: string;
  username: string;
  token: string;
}

const EMPTY: FormState = {
  name: "",
  provider: "GITHUB",
  baseUrl: PROVIDER_META.GITHUB.defaultBaseUrl,
  username: "",
  token: "",
};

export function ConnectionsManager({ connections }: { connections: ConnectionWithCount[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectionWithCount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(connection: ConnectionWithCount) {
    setEditing(connection);
    setForm({
      name: connection.name,
      provider: connection.provider,
      baseUrl: connection.baseUrl,
      username: connection.username ?? "",
      token: "",
    });
    setError(null);
    setDialogOpen(true);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => {
      if (key === "provider") {
        const provider = value as GitProvider;
        const wasDefault = Object.values(PROVIDER_META).some(
          (meta) => meta.defaultBaseUrl === previous.baseUrl,
        );
        return {
          ...previous,
          provider,
          baseUrl: wasDefault || !previous.baseUrl
            ? PROVIDER_META[provider].defaultBaseUrl
            : previous.baseUrl,
        };
      }
      return { ...previous, [key]: value };
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    // Beim Bearbeiten bedeutet ein leeres Token-Feld "unveraendert lassen".
    const body: Record<string, unknown> = {
      name: form.name,
      provider: form.provider,
      baseUrl: form.baseUrl,
      username: form.username,
    };
    if (!editing || form.token.trim()) body.token = form.token;

    try {
      const response = await fetch(
        editing ? `/api/connections/${editing.id}` : "/api/connections",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      setDialogOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function check(connection: ConnectionWithCount) {
    setBusyId(connection.id);
    try {
      const response = await fetch(`/api/connections/${connection.id}/check`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      setCheckResult((previous) => ({
        ...previous,
        [connection.id]: {
          ok: Boolean(payload.ok),
          message: payload.message ?? payload.error ?? "Unbekannte Antwort.",
        },
      }));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(connection: ConnectionWithCount) {
    const linked = connection._count?.projects ?? 0;
    const hint = linked > 0 ? `\n\n${linked} Projekt(e) verlieren die Verknuepfung.` : "";
    if (!window.confirm(`Verbindung „${connection.name}“ loeschen?${hint}`)) return;
    setBusyId(connection.id);
    await fetch(`/api/connections/${connection.id}`, { method: "DELETE" }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Git-Verbindungen</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Pro Git-System eine Verbindung mit Basis-URL und Access Token. Tokens werden
            AES-256-GCM-verschluesselt in der Datenbank abgelegt und verlassen den Server nie.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Verbindung hinzufuegen
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="glass fade-up flex flex-col items-center gap-4 px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-violet-500/20 text-cyan-200">
            <Plug className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-white">Noch keine Verbindung</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              Verbinde GitHub, GitLab oder deine eigene Gitea-Instanz, um Branches, Tags,
              Commits und Releases direkt im Dashboard zu sehen.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Erste Verbindung anlegen
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.map((connection, index) => {
            const meta = PROVIDER_META[connection.provider];
            const result = checkResult[connection.id];
            const ok = result ? result.ok : connection.lastCheckOk;
            const message = result?.message ?? connection.lastCheckMessage;

            return (
              <article
                key={connection.id}
                className="glass card-glow fade-up relative p-5"
                style={
                  {
                    "--accent-from": "#22d3ee",
                    "--accent-to": "#8b5cf6",
                    animationDelay: `${index * 50}ms`,
                  } as React.CSSProperties
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-white">
                      {connection.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">{meta.label}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] ring-1 ring-inset",
                      ok === true
                        ? "bg-emerald-500/12 text-emerald-200 ring-emerald-400/30"
                        : ok === false
                          ? "bg-rose-500/12 text-rose-200 ring-rose-400/30"
                          : "bg-slate-500/12 text-slate-300 ring-slate-400/25",
                    )}
                  >
                    {ok === true ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : ok === false ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    {ok === true ? "verbunden" : ok === false ? "Fehler" : "ungeprueft"}
                  </span>
                </div>

                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">Basis-URL</dt>
                    <dd className="min-w-0 truncate text-right font-mono text-slate-300">
                      {connection.baseUrl}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">Token</dt>
                    <dd className="font-mono text-slate-300">
                      {connection.tokenHint ? (
                        <span className="inline-flex items-center gap-1.5">
                          <KeyRound className="h-3 w-3 text-amber-300/70" />
                          {connection.tokenHint}
                        </span>
                      ) : (
                        <span className="text-slate-600">keines</span>
                      )}
                    </dd>
                  </div>
                  {connection.username ? (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">Benutzer</dt>
                      <dd className="truncate text-slate-300">{connection.username}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">Projekte</dt>
                    <dd className="tabular-nums text-slate-300">
                      {connection._count?.projects ?? 0}
                    </dd>
                  </div>
                  {connection.lastCheckedAt ? (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">Geprueft</dt>
                      <dd className="text-slate-300" suppressHydrationWarning>
                        {formatRelative(connection.lastCheckedAt)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {message ? (
                  <p
                    className={cn(
                      "mt-3 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug",
                      ok ? "bg-emerald-500/8 text-emerald-200/90" : "bg-rose-500/8 text-rose-200/90",
                    )}
                  >
                    {message}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/6 pt-3">
                  <button
                    type="button"
                    className="btn btn-ghost px-2.5 py-1.5 text-xs"
                    onClick={() => check(connection)}
                    disabled={busyId === connection.id}
                  >
                    {busyId === connection.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    Testen
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2.5 py-1.5 text-xs"
                    onClick={() => openEdit(connection)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger ml-auto px-2.5 py-1.5 text-xs"
                    onClick={() => remove(connection)}
                    disabled={busyId === connection.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Verbindung bearbeiten" : "Neue Git-Verbindung"}
        description="Der Token wird verschluesselt gespeichert und nur serverseitig entschluesselt."
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <span className="field-label">Git-System</span>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => update("provider", provider)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm transition-all",
                    form.provider === provider
                      ? "border-violet-400/60 bg-violet-500/12 text-white shadow-[0_0_24px_-10px_rgba(139,92,246,0.9)]"
                      : "border-white/9 text-slate-400 hover:border-white/20 hover:text-slate-200",
                  )}
                >
                  {PROVIDER_META[provider].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="connection-name">
              Anzeigename *
            </label>
            <input
              id="connection-name"
              className="field"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="z. B. Firmen-Gitea"
              required
              maxLength={80}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="connection-url">
              Basis-URL *
            </label>
            <input
              id="connection-url"
              className="field font-mono text-xs"
              value={form.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://git.example.com"
              required
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Ohne /api – Nebula haengt den API-Pfad selbst an.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="connection-token">
              Access Token {editing ? "(leer lassen = unveraendert)" : ""}
            </label>
            <input
              id="connection-token"
              className="field font-mono text-xs"
              type="password"
              value={form.token}
              onChange={(event) => update("token", event.target.value)}
              placeholder={editing ? "••••••••" : "ghp_… / glpat-… / gitea token"}
              autoComplete="off"
            />
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              {PROVIDER_META[form.provider].tokenHelp}
              <a
                href={PROVIDER_META[form.provider].docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
              >
                Doku
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="connection-username">
              Benutzername (optional)
            </label>
            <input
              id="connection-username"
              className="field"
              value={form.username}
              onChange={(event) => update("username", event.target.value)}
              placeholder="wird beim Test automatisch gefuellt"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
