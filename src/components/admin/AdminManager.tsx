"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  Database,
  Download,
  Fingerprint,
  FolderGit2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserCog,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

type Mode = "SINGLE_USER" | "MULTI_USER";
type Role = "ADMIN" | "USER";

export interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | Date | null;
  lockedUntil: string | Date | null;
  createdAt: string | Date;
  _count: { credentials: number; projects: number; sessions: number };
}

export interface AutoSyncReport {
  at: string;
  trigger: "zeitplan" | "manuell";
  candidates: number;
  synced: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface AdminData {
  mode: Mode;
  allowRegistration: boolean;
  users: AdminUser[];
  currentUserId: string;
  appUrl: string;
  passkeysAvailable: boolean;
  autoSync: {
    enabled: boolean;
    intervalMinutes: number;
    activeOnly: boolean;
    batchSize: number;
    lastRunAt: string | Date | null;
    lastReport: AutoSyncReport | null;
    /** Projekte mit Repository, die grundsaetzlich in Frage kommen. */
    eligible: number;
  };
}

type Notice = { ok: boolean; text: string } | null;

export function AdminManager({ data }: { data: AdminData }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(data.mode);
  const [allowRegistration, setAllowRegistration] = useState(data.allowRegistration);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  async function patchSettings(payload: Partial<{ mode: Mode; allowRegistration: boolean }>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Speichern fehlgeschlagen.");

      setMode(body.settings.mode);
      setAllowRegistration(body.settings.allowRegistration);
      setNotice({ ok: true, text: "Einstellungen gespeichert." });
      router.refresh();
    } catch (caught) {
      // Umschalter zuruecksetzen, wenn der Server ablehnt.
      setMode(data.mode);
      setAllowRegistration(data.allowRegistration);
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Betriebsart ─────────────────────────────────── */}
      <section className="glass p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Betriebsart
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Bestimmt, ob die Instanz nur dir gehoert oder mehrere Konten verwaltet.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={mode === "SINGLE_USER"}
            disabled={busy}
            icon={User}
            title="Einzelbetrieb"
            hint="Genau ein Konto. Keine Registrierung, keine Benutzerverwaltung."
            onClick={() => {
              setMode("SINGLE_USER");
              void patchSettings({ mode: "SINGLE_USER" });
            }}
          />
          <ModeCard
            active={mode === "MULTI_USER"}
            disabled={busy}
            icon={Users}
            title="Mehrbenutzerbetrieb"
            hint="Mehrere Konten. Projekte, Notizen und Git-Verbindungen bleiben streng getrennt."
            onClick={() => {
              setMode("MULTI_USER");
              void patchSettings({ mode: "MULTI_USER" });
            }}
          />
        </div>

        {mode === "MULTI_USER" ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
            <input
              type="checkbox"
              checked={allowRegistration}
              disabled={busy}
              onChange={(event) => {
                setAllowRegistration(event.target.checked);
                void patchSettings({ allowRegistration: event.target.checked });
              }}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              <span className="block text-sm text-slate-200">Selbstregistrierung erlauben</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Ist das aus, legt nur ein Administrator neue Konten an. Bei einer aus dem
                Internet erreichbaren Instanz besser aus lassen.
              </span>
            </span>
          </label>
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

      <AutoSyncSection data={data.autoSync} />

      {/* ── Instanz ─────────────────────────────────────── */}
      <section className="glass p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/12 text-cyan-300">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Instanz
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Diese Werte kommen aus der <code className="text-violet-300">.env</code> und
              lassen sich nur dort aendern.
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="glass-soft px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">APP_URL</dt>
            <dd className="mt-1 truncate font-mono text-sm text-slate-200">{data.appUrl}</dd>
          </div>
          <div className="glass-soft px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">Passkeys</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm text-slate-200">
              {data.passkeysAvailable ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  verfuegbar
                </>
              ) : (
                <>
                  <Ban className="h-3.5 w-3.5 text-amber-300" />
                  kein sicherer Kontext
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Sicherung ───────────────────────────────────── */}
      <section className="glass p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-300">
            <Database className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Sicherung
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Vollstaendige Sicherung der Instanz als JSON: Einstellungen, Konten,
              Verbindungen, Projekte und Notizen.
            </p>
          </div>
        </div>

        <a href="/api/admin/backup" download className="btn btn-ghost">
          <Download className="h-4 w-4" />
          Sicherung herunterladen
        </a>

        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11px] leading-snug text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Die Datei enthaelt Passwort-Hashes und verschluesselte Git-Tokens. Die Tokens
            sind nur mit demselben <code>APP_SECRET</code> wieder lesbar, Passwoerter
            liegen als scrypt-Hash vor – trotzdem vertraulich behandeln. Fuer eine
            byteweise Sicherung der Datenbank gibt es <code>scripts/backup.ps1</code>{" "}
            beziehungsweise <code>scripts/backup.sh</code> mit <code>pg_dump</code>.
          </span>
        </p>
      </section>

      {/* ── Benutzer ────────────────────────────────────── */}
      <section className="glass p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-300">
              <UserCog className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Benutzer ({data.users.length})
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Administratoren verwalten Konten – Projekte anderer sehen sie nicht.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary px-3 py-1.5 text-xs"
            onClick={() => setCreateOpen(true)}
            disabled={mode === "SINGLE_USER"}
            title={
              mode === "SINGLE_USER"
                ? "Erst in den Mehrbenutzerbetrieb wechseln"
                : undefined
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Konto anlegen
          </button>
        </div>

        <div className="space-y-2">
          {data.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === data.currentUserId}
              onEdit={() => setEditing(user)}
            />
          ))}
        </div>
      </section>

      <UserDialog
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
      />
      <UserDialog
        open={editing !== null}
        mode="edit"
        user={editing}
        isSelf={editing?.id === data.currentUserId}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

const INTERVALS = [
  { value: 15, label: "alle 15 Minuten" },
  { value: 30, label: "alle 30 Minuten" },
  { value: 60, label: "stuendlich" },
  { value: 180, label: "alle 3 Stunden" },
  { value: 360, label: "alle 6 Stunden" },
  { value: 720, label: "alle 12 Stunden" },
  { value: 1440, label: "taeglich" },
];

function AutoSyncSection({ data }: { data: AdminData["autoSync"] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(data.enabled);
  const [interval, setIntervalMinutes] = useState(data.intervalMinutes);
  const [activeOnly, setActiveOnly] = useState(data.activeOnly);
  const [batchSize, setBatchSize] = useState(data.batchSize);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Speichern fehlgeschlagen.");
      setNotice({ ok: true, text: "Gespeichert." });
      router.refresh();
    } catch (caught) {
      setEnabled(data.enabled);
      setIntervalMinutes(data.intervalMinutes);
      setActiveOnly(data.activeOnly);
      setBatchSize(data.batchSize);
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/sync/run", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Abgleich fehlgeschlagen.");
      const report = body.report as AutoSyncReport;
      setNotice({
        ok: true,
        text:
          `${report.synced} aktualisiert, ${report.failed} fehlgeschlagen, ` +
          `${report.skipped} zurueckgestellt (${Math.round(report.durationMs / 1000)} s).`,
      });
      router.refresh();
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setRunning(false);
    }
  }

  const nextRun =
    enabled && data.lastRunAt
      ? new Date(new Date(data.lastRunAt).getTime() + interval * 60_000)
      : null;

  return (
    <section className="glass p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/12 text-cyan-300">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Automatischer Abgleich
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Holt Branches, Tags, Commits und Releases im Hintergrund. Gilt fuer alle
              Konten – die Daten bleiben dabei getrennt, abgeglichen wird nur, was
              ohnehin verknuepft ist.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-xs"
          onClick={runNow}
          disabled={running || data.eligible === 0}
          title={data.eligible === 0 ? "Kein Projekt mit Repository verknuepft" : undefined}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Jetzt abgleichen
        </button>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => {
            setEnabled(event.target.checked);
            void patch({ autoSyncEnabled: event.target.checked });
          }}
          className="mt-0.5 h-4 w-4 accent-violet-500"
        />
        <span>
          <span className="block text-sm text-slate-200">Regelmaessig abgleichen</span>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            Standardmaessig aus. Jeder Durchlauf verbraucht Kontingent bei GitHub,
            GitLab und Gitea – ohne Token ist das schnell erschoepft.
          </span>
        </span>
      </label>

      {enabled ? (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="autosync-interval">
                Abstand
              </label>
              <select
                id="autosync-interval"
                className="field"
                value={interval}
                disabled={busy}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setIntervalMinutes(value);
                  void patch({ autoSyncIntervalMinutes: value });
                }}
              >
                {INTERVALS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="autosync-batch">
                Projekte je Durchlauf: {batchSize}
              </label>
              <input
                id="autosync-batch"
                type="range"
                min={1}
                max={100}
                step={1}
                value={batchSize}
                disabled={busy}
                onChange={(event) => setBatchSize(Number(event.target.value))}
                onMouseUp={() => patch({ autoSyncBatchSize: batchSize })}
                onTouchEnd={() => patch({ autoSyncBatchSize: batchSize })}
                onKeyUp={() => patch({ autoSyncBatchSize: batchSize })}
                className="range mt-2"
                style={{ "--fill": `${batchSize}%` } as React.CSSProperties}
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Am laengsten nicht abgeglichene zuerst. Der Rest kommt beim naechsten Mal.
              </p>
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3">
            <input
              type="checkbox"
              checked={activeOnly}
              disabled={busy}
              onChange={(event) => {
                setActiveOnly(event.target.checked);
                void patch({ autoSyncActiveOnly: event.target.checked });
              }}
              className="mt-0.5 h-4 w-4 accent-violet-500"
            />
            <span>
              <span className="block text-sm text-slate-200">
                Fertige und archivierte Projekte auslassen
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Dort aendert sich selten noch etwas.
              </span>
            </span>
          </label>
        </>
      ) : null}

      {/* Zustand */}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="glass-soft px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">
            Verknuepfte Projekte
          </dt>
          <dd className="mt-1 text-sm tabular-nums text-slate-200">{data.eligible}</dd>
        </div>
        <div className="glass-soft px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">
            Letzter Durchlauf
          </dt>
          <dd className="mt-1 text-sm text-slate-200" suppressHydrationWarning>
            {data.lastRunAt ? formatRelative(data.lastRunAt) : "noch keiner"}
          </dd>
        </div>
        <div className="glass-soft px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-slate-500">
            Naechster Durchlauf
          </dt>
          <dd className="mt-1 text-sm text-slate-200" suppressHydrationWarning>
            {enabled ? (nextRun ? formatDateTime(nextRun) : "in Kuerze") : "abgeschaltet"}
          </dd>
        </div>
      </dl>

      {data.lastReport ? (
        <p className="mt-3 text-[11px] text-slate-500" suppressHydrationWarning>
          Zuletzt ({data.lastReport.trigger}): {data.lastReport.synced} aktualisiert,{" "}
          {data.lastReport.failed} fehlgeschlagen, {data.lastReport.skipped} zurueckgestellt
          in {Math.round(data.lastReport.durationMs / 1000)} s.
        </p>
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

function ModeCard({
  active,
  disabled,
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: typeof User;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-60",
        active
          ? "border-violet-400/60 bg-violet-500/12 shadow-[0_0_28px_-12px_rgba(139,92,246,0.9)]"
          : "border-white/9 hover:border-white/20",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
        <Icon className={cn("h-4 w-4", active ? "text-violet-300" : "text-slate-500")} />
        {title}
        {active ? (
          <CheckCircle2 className="ml-auto h-4 w-4 text-violet-300" />
        ) : null}
      </span>
      <span className="mt-1.5 block text-[11px] leading-snug text-slate-500">{hint}</span>
    </button>
  );
}

function UserRow({
  user,
  isSelf,
  onEdit,
}: {
  user: AdminUser;
  isSelf: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked =
    user.lockedUntil !== null && new Date(user.lockedUntil).getTime() > Date.now();

  async function remove() {
    if (
      !window.confirm(
        `Konto „${user.username}“ mit ${user._count.projects} Projekt(en) unwiderruflich loeschen?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Loeschen fehlgeschlagen.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-soft px-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white",
            user.isActive
              ? "bg-gradient-to-br from-violet-500/80 to-cyan-400/70"
              : "bg-slate-700/60",
          )}
        >
          {(user.displayName ?? user.username).slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-100">
            <span className="truncate">{user.displayName ?? user.username}</span>
            <span className="font-mono text-[11px] text-slate-500">@{user.username}</span>
            {user.role === "ADMIN" ? (
              <span className="inline-flex items-center gap-1 rounded bg-violet-500/12 px-1.5 py-0.5 text-[10px] text-violet-200">
                <ShieldCheck className="h-2.5 w-2.5" />
                Admin
              </span>
            ) : null}
            {isSelf ? (
              <span className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-slate-400">
                du
              </span>
            ) : null}
            {!user.isActive ? (
              <span className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[10px] text-rose-200">
                deaktiviert
              </span>
            ) : null}
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/12 px-1.5 py-0.5 text-[10px] text-amber-200">
                <Lock className="h-2.5 w-2.5" />
                gesperrt
              </span>
            ) : null}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <FolderGit2 className="h-3 w-3" />
              {user._count.projects} Projekte
            </span>
            <span className="inline-flex items-center gap-1">
              <Fingerprint className="h-3 w-3" />
              {user._count.credentials} Passkeys
            </span>
            <span suppressHydrationWarning>
              {user.lastLoginAt
                ? `zuletzt ${formatRelative(user.lastLoginAt)}`
                : "noch nie angemeldet"}
            </span>
            <span suppressHydrationWarning>angelegt {formatDateTime(user.createdAt)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
            disabled={busy}
          >
            <UserCog className="h-3.5 w-3.5" />
            Bearbeiten
          </button>
          <button
            type="button"
            onClick={remove}
            className="btn btn-danger px-2.5 py-1.5 text-xs"
            disabled={busy || isSelf}
            title={isSelf ? "Das eigene Konto kann nicht geloescht werden" : "Loeschen"}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

function UserDialog({
  open,
  mode,
  user,
  isSelf,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  user?: AdminUser | null;
  isSelf?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Formular beim Oeffnen einmalig aus dem Datensatz fuellen.
  const key = open ? (user?.id ?? "new") : null;
  if (key !== null && key !== loadedFor) {
    setLoadedFor(key);
    setUsername(user?.username ?? "");
    setDisplayName(user?.displayName ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
    setRole(user?.role ?? "USER");
    setIsActive(user?.isActive ?? true);
    setError(null);
    setFieldErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const body =
      mode === "create"
        ? { username, displayName, email, password, role }
        : { displayName, email, role, isActive, password: password || null };

    try {
      const response = await fetch(
        mode === "create" ? "/api/admin/users" : `/api/admin/users/${user?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFieldErrors(payload.fields ?? {});
        throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      }
      setLoadedFor(null);
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setLoadedFor(null);
        onClose();
      }}
      title={mode === "create" ? "Neues Konto" : `Konto bearbeiten`}
      description={
        mode === "create"
          ? "Das Konto kann sich sofort anmelden und einen eigenen Passkey hinterlegen."
          : "Ein neues Passwort beendet alle Sitzungen dieses Kontos."
      }
      width="md"
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === "create" ? (
          <div>
            <label className="field-label" htmlFor="admin-username">
              Benutzername *
            </label>
            <input
              id="admin-username"
              className="field"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            {fieldErrors.username ? (
              <p className="mt-1 text-xs text-rose-300">{fieldErrors.username}</p>
            ) : null}
          </div>
        ) : (
          <p className="font-mono text-sm text-slate-400">@{user?.username}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="admin-display">
              Anzeigename
            </label>
            <input
              id="admin-display"
              className="field"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="admin-email">
              E-Mail
            </label>
            <input
              id="admin-email"
              className="field"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email ? (
              <p className="mt-1 text-xs text-rose-300">{fieldErrors.email}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="admin-password">
            {mode === "create" ? "Passwort *" : "Neues Passwort (leer = unveraendert)"}
          </label>
          <input
            id="admin-password"
            className="field"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={mode === "create" ? PASSWORD_MIN_LENGTH : undefined}
            required={mode === "create"}
          />
          {fieldErrors.password ? (
            <p className="mt-1 text-xs text-rose-300">{fieldErrors.password}</p>
          ) : null}
        </div>

        <div>
          <span className="field-label">Rolle</span>
          <div className="grid grid-cols-2 gap-2">
            {(["USER", "ADMIN"] as Role[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                disabled={isSelf && value === "USER"}
                title={
                  isSelf && value === "USER"
                    ? "Die eigene Administratorrolle kann hier nicht abgegeben werden"
                    : undefined
                }
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm transition-all disabled:opacity-40",
                  role === value
                    ? "border-violet-400/60 bg-violet-500/12 text-white"
                    : "border-white/9 text-slate-400 hover:border-white/20",
                )}
              >
                {value === "ADMIN" ? "Administrator" : "Benutzer"}
              </button>
            ))}
          </div>
        </div>

        {mode === "edit" ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={isSelf}
              className="h-4 w-4 accent-violet-500"
            />
            Konto aktiv
            {isSelf ? (
              <span className="text-[11px] text-slate-600">
                (das eigene Konto laesst sich nicht deaktivieren)
              </span>
            ) : null}
          </label>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setLoadedFor(null);
              onClose();
            }}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  );
}
