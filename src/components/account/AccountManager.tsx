"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import {
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

export interface PasskeyEntry {
  id: string;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
}

export interface SessionEntry {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string | Date;
  lastSeenAt: string | Date;
}

export interface AccountData {
  username: string;
  displayName: string | null;
  email: string | null;
  role: "ADMIN" | "USER";
  hasPassword: boolean;
  passkeys: PasskeyEntry[];
  sessions: SessionEntry[];
  passkeysAvailable: boolean;
}

type Notice = { ok: boolean; text: string } | null;

export function AccountManager({ data }: { data: AccountData }) {
  return (
    <div className="space-y-6">
      <ProfileSection data={data} />
      <PasswordSection hasPassword={data.hasPassword} />
      <PasskeySection passkeys={data.passkeys} available={data.passkeysAvailable} />
      <SessionSection sessions={data.sessions} />
    </div>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof KeyRound;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
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
  );
}

function ProfileSection({ data }: { data: AccountData }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(data.displayName ?? "");
  const [email, setEmail] = useState(data.email ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      setNotice({ ok: true, text: "Profil gespeichert." });
      router.refresh();
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Profil" icon={Pencil}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="field-label">Benutzername</span>
          <p className="font-mono text-sm text-slate-400">@{data.username}</p>
          <p className="mt-1 text-[11px] text-slate-600">
            {data.role === "ADMIN" ? "Administrator" : "Benutzer"} · nicht aenderbar
          </p>
        </div>
        <div />
        <div>
          <label className="field-label" htmlFor="account-display">
            Anzeigename
          </label>
          <input
            id="account-display"
            className="field"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="account-email">
            E-Mail
          </label>
          <input
            id="account-email"
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="optional"
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Speichern
          </button>
          <NoticeLine notice={notice} />
        </div>
      </form>
    </SectionCard>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== repeat) {
      setNotice({ ok: false, text: "Die Passwoerter stimmen nicht ueberein." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Aenderung fehlgeschlagen.");
      setNotice({
        ok: true,
        text: "Passwort gesetzt. Alle anderen Sitzungen wurden abgemeldet.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setRepeat("");
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title={hasPassword ? "Passwort aendern" : "Passwort vergeben"}
      icon={KeyRound}
      description={
        hasPassword
          ? "Nach der Aenderung werden alle anderen Sitzungen beendet."
          : "Dieses Konto hat bisher kein Passwort und nutzt nur Passkeys."
      }
    >
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {hasPassword ? (
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="account-current">
              Aktuelles Passwort
            </label>
            <input
              id="account-current"
              className="field"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        ) : null}

        <div>
          <label className="field-label" htmlFor="account-new">
            Neues Passwort
          </label>
          <input
            id="account-new"
            className="field"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="account-repeat">
            Wiederholen
          </label>
          <input
            id="account-repeat"
            className="field"
            type="password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {hasPassword ? "Passwort aendern" : "Passwort setzen"}
          </button>
          <NoticeLine notice={notice} />
        </div>
      </form>
    </SectionCard>
  );
}

function PasskeySection({
  passkeys,
  available,
}: {
  passkeys: PasskeyEntry[];
  available: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function addPasskey() {
    setBusy(true);
    setNotice(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const optionsPayload = await optionsResponse.json().catch(() => ({}));
      if (!optionsResponse.ok) {
        throw new Error(optionsPayload.error ?? "Passkey konnte nicht vorbereitet werden.");
      }

      const attestation = await startRegistration({ optionsJSON: optionsPayload.options });

      const suggestion =
        typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
          ? "Mac"
          : typeof navigator !== "undefined" && /win/i.test(navigator.platform)
            ? "Windows"
            : "Geraet";

      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation, name: suggestion }),
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) {
        throw new Error(verifyPayload.error ?? "Passkey wurde nicht akzeptiert.");
      }

      setNotice({ ok: true, text: "Passkey hinzugefuegt." });
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (!/abort|NotAllowed/i.test(message)) setNotice({ ok: false, text: message });
    } finally {
      setBusy(false);
    }
  }

  async function rename(entry: PasskeyEntry) {
    const name = window.prompt("Name des Passkeys", entry.name ?? "");
    if (name === null) return;
    setBusyId(entry.id);
    await fetch(`/api/account/passkeys/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  async function remove(entry: PasskeyEntry) {
    if (!window.confirm(`Passkey „${entry.name ?? "ohne Namen"}“ entfernen?`)) return;
    setBusyId(entry.id);
    try {
      const response = await fetch(`/api/account/passkeys/${entry.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Loeschen fehlgeschlagen.");
      router.refresh();
    } catch (caught) {
      setNotice({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SectionCard
      title="Passkeys"
      icon={Fingerprint}
      description="Anmeldung per Fingerabdruck, Gesichtserkennung oder Sicherheitsschluessel – ohne Passwort."
    >
      {!available ? (
        <p className="rounded-lg border border-white/8 bg-black/25 px-3 py-2 text-sm text-slate-400">
          Passkeys sind derzeit nicht verfuegbar. Sie benoetigen einen sicheren Kontext:
          <code className="mx-1 text-violet-300">APP_URL</code> muss auf eine https-Adresse
          oder auf http://localhost zeigen.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {passkeys.length === 0 ? (
              <p className="text-sm text-slate-500">Noch kein Passkey hinterlegt.</p>
            ) : (
              passkeys.map((entry) => (
                <div
                  key={entry.id}
                  className="glass-soft flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm text-slate-200">
                      <Fingerprint className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                      {entry.name ?? "Unbenannter Passkey"}
                      {entry.backedUp ? (
                        <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] text-emerald-200">
                          synchronisiert
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500" suppressHydrationWarning>
                      angelegt {formatDateTime(entry.createdAt)}
                      {entry.lastUsedAt
                        ? ` · zuletzt genutzt ${formatRelative(entry.lastUsedAt)}`
                        : " · noch nie genutzt"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {busyId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => rename(entry)}
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/8 hover:text-violet-300"
                          aria-label="Umbenennen"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(entry)}
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/12 hover:text-rose-300"
                          aria-label="Entfernen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <button type="button" className="btn btn-ghost mt-4" onClick={addPasskey} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            Passkey hinzufuegen
          </button>
        </>
      )}

      <NoticeLine notice={notice} />
    </SectionCard>
  );
}

function SessionSection({ sessions }: { sessions: SessionEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logoutEverywhere() {
    if (!window.confirm("Auf allen anderen Geraeten abmelden?")) return;
    setBusy(true);
    await fetch("/api/account/sessions", { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    router.refresh();
  }

  return (
    <SectionCard
      title="Aktive Sitzungen"
      icon={Monitor}
      description="Jede Anmeldung erzeugt eine Sitzung. Sie laeuft nach 30 Tagen ohne Nutzung ab."
    >
      <div className="space-y-2">
        {sessions.map((session) => (
          <div key={session.id} className="glass-soft px-3 py-2.5">
            <p className="truncate text-sm text-slate-300">
              {shortenUserAgent(session.userAgent)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500" suppressHydrationWarning>
              {session.ip ?? "unbekannte Adresse"} · aktiv {formatRelative(session.lastSeenAt)} ·
              angemeldet {formatDateTime(session.createdAt)}
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-danger mt-4"
        onClick={logoutEverywhere}
        disabled={busy || sessions.length <= 1}
      >
        {busy ? <Loader2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        Ueberall abmelden
      </button>
      {sessions.length <= 1 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
          <ShieldCheck className="h-3 w-3" />
          Nur dieses Geraet ist angemeldet.
        </p>
      ) : null}
    </SectionCard>
  );
}

/** Aus dem User-Agent etwas Lesbares machen, ohne Bibliothek. */
function shortenUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unbekanntes Geraet";

  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Browser";

  const platform =
    /Windows/.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS/.test(userAgent) ? "macOS"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "";

  return platform ? `${browser} auf ${platform}` : browser;
}
