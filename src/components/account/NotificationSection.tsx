"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import type { NotificationChannel, NotificationEvent } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { EVENT_META, NOTIFICATION_EVENTS } from "@/lib/notify/types";
import { cn, formatRelative } from "@/lib/utils";

export interface NotificationTargetEntry {
  id: string;
  name: string;
  channel: NotificationChannel;
  target: string;
  secretHint: string | null;
  events: NotificationEvent[];
  isActive: boolean;
  lastSentAt: string | Date | null;
  lastOk: boolean | null;
  lastMessage: string | null;
}

const CHANNEL_META: Record<
  NotificationChannel,
  { label: string; icon: typeof Webhook; hint: string; placeholder: string }
> = {
  NTFY: {
    label: "ntfy",
    icon: BellRing,
    hint: "Vollstaendige Themen-URL, z. B. https://ntfy.sh/mein-geheimes-thema",
    placeholder: "https://ntfy.sh/mein-thema",
  },
  WEBHOOK: {
    label: "Webhook",
    icon: Webhook,
    hint: "Bekommt JSON per POST. Mit Geheimnis wird der Rumpf signiert (X-Nebula-Signature).",
    placeholder: "https://mein-dienst.de/haken",
  },
  EMAIL: {
    label: "E-Mail",
    icon: Mail,
    hint: "Braucht SMTP-Zugangsdaten in der .env der Instanz.",
    placeholder: "ich@example.com",
  },
};

export function NotificationSection({
  targets,
  emailAvailable,
}: {
  targets: NotificationTargetEntry[];
  emailAvailable: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationTargetEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function test(entry: NotificationTargetEntry) {
    setBusyId(entry.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/notifications/${entry.id}/test`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      setNotice({ ok: response.ok, text: body.message ?? body.error ?? "Unbekannte Antwort." });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(entry: NotificationTargetEntry) {
    if (!window.confirm(`Ziel „${entry.name}“ entfernen?`)) return;
    setBusyId(entry.id);
    await fetch(`/api/notifications/${entry.id}`, { method: "DELETE" }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  async function toggle(entry: NotificationTargetEntry) {
    setBusyId(entry.id);
    await fetch(`/api/notifications/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !entry.isActive }),
    }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  return (
    <section className="glass p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Benachrichtigungen
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Meldung bei fehlgeschlagenem Abgleich, roter CI oder neuem Release. Gemeldet
              wird nur bei einer <strong className="text-slate-300">Aenderung</strong> –
              nicht bei jedem Durchlauf.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-xs"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Ziel hinzufuegen
        </button>
      </div>

      {targets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/8 px-4 py-6 text-center text-sm text-slate-500">
          Noch kein Ziel eingerichtet.
        </p>
      ) : (
        <div className="space-y-2">
          {targets.map((entry) => {
            const meta = CHANNEL_META[entry.channel];
            const Icon = meta.icon;
            return (
              <div key={entry.id} className="glass-soft px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-100">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                      {entry.name}
                      <span className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                        {meta.label}
                      </span>
                      {!entry.isActive ? (
                        <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-400">
                          pausiert
                        </span>
                      ) : null}
                      {entry.secretHint ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-300/70">
                          <KeyRound className="h-2.5 w-2.5" />
                          {entry.secretHint}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                      {entry.target}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {entry.events.map((event) => (
                        <span
                          key={event}
                          className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-slate-400"
                        >
                          {EVENT_META[event].emoji} {EVENT_META[event].label}
                        </span>
                      ))}
                    </p>
                    {entry.lastSentAt ? (
                      <p
                        className={cn(
                          "mt-1.5 flex items-center gap-1.5 text-[11px]",
                          entry.lastOk ? "text-emerald-200/80" : "text-rose-200/80",
                        )}
                        suppressHydrationWarning
                      >
                        {entry.lastOk ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {formatRelative(entry.lastSentAt)} · {entry.lastMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {busyId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost px-2.5 py-1.5 text-xs"
                          onClick={() => test(entry)}
                        >
                          Testen
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-2.5 py-1.5 text-xs"
                          onClick={() => toggle(entry)}
                          title={entry.isActive ? "Pausieren" : "Fortsetzen"}
                        >
                          {entry.isActive ? "Pause" : "An"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/8 hover:text-violet-300"
                          onClick={() => {
                            setEditing(entry);
                            setDialogOpen(true);
                          }}
                          aria-label="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/12 hover:text-rose-300"
                          onClick={() => remove(entry)}
                          aria-label="Entfernen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      {!emailAvailable ? (
        <p className="mt-3 text-[11px] text-slate-600">
          E-Mail steht nicht bereit: In der <code className="text-violet-300">.env</code> der
          Instanz fehlt <code className="text-violet-300">SMTP_HOST</code>. ntfy und Webhook
          funktionieren ohne weitere Einrichtung.
        </p>
      ) : null}

      <TargetDialog
        open={dialogOpen}
        entry={editing}
        emailAvailable={emailAvailable}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
      />
    </section>
  );
}

function TargetDialog({
  open,
  entry,
  emailAvailable,
  onClose,
}: {
  open: boolean;
  entry: NotificationTargetEntry | null;
  emailAvailable: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>("NTFY");
  const [target, setTarget] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<NotificationEvent[]>(["SYNC_FAILED", "CI_FAILED"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = Boolean(entry);

  useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? "");
    setChannel(entry?.channel ?? "NTFY");
    setTarget(entry?.target ?? "");
    setSecret("");
    setEvents(entry?.events ?? ["SYNC_FAILED", "CI_FAILED"]);
    setError(null);
    setFieldErrors({});
  }, [open, entry]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const body: Record<string, unknown> = { name, target, events };
    if (!isEdit) body.channel = channel;
    if (!isEdit || secret.trim()) body.secret = secret;

    try {
      const response = await fetch(
        isEdit ? `/api/notifications/${entry?.id}` : "/api/notifications",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFieldErrors(payload.fields ?? {});
        throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      }
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const meta = CHANNEL_META[channel];

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={isEdit ? "Ziel bearbeiten" : "Neues Benachrichtigungsziel"}
      description={
        isEdit ? "Der Zustellweg selbst laesst sich nicht mehr aendern." : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {!isEdit ? (
          <div>
            <span className="field-label">Weg</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CHANNEL_META) as NotificationChannel[]).map((value) => {
                const option = CHANNEL_META[value];
                const Icon = option.icon;
                const disabled = value === "EMAIL" && !emailAvailable;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setChannel(value)}
                    title={disabled ? "Kein SMTP in der .env hinterlegt" : undefined}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm transition-all disabled:opacity-40",
                      channel === value
                        ? "border-violet-400/60 bg-violet-500/12 text-white"
                        : "border-white/9 text-slate-400 hover:border-white/20",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <label className="field-label" htmlFor="notify-name">
            Name *
          </label>
          <input
            id="notify-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Handy"
            required
            maxLength={60}
          />
          {fieldErrors.name ? (
            <p className="mt-1 text-xs text-rose-300">{fieldErrors.name}</p>
          ) : null}
        </div>

        <div>
          <label className="field-label" htmlFor="notify-target">
            {channel === "EMAIL" ? "E-Mail-Adresse *" : "URL *"}
          </label>
          <input
            id="notify-target"
            className="field font-mono text-xs"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={meta.placeholder}
            required
          />
          <p className="mt-1 text-[11px] text-slate-500">{meta.hint}</p>
          {fieldErrors.target ? (
            <p className="mt-1 text-xs text-rose-300">{fieldErrors.target}</p>
          ) : null}
        </div>

        {channel !== "EMAIL" ? (
          <div>
            <label className="field-label" htmlFor="notify-secret">
              Geheimnis {isEdit ? "(leer = unveraendert)" : "(optional)"}
            </label>
            <input
              id="notify-secret"
              className="field font-mono text-xs"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
              placeholder={isEdit ? "••••••••" : ""}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {channel === "NTFY"
                ? "Wird als Bearer-Token gesendet – fuer geschuetzte Themen."
                : "Signiert den Rumpf per HMAC-SHA256 im Kopf X-Nebula-Signature."}
            </p>
          </div>
        ) : null}

        <div>
          <span className="field-label">Anlaesse *</span>
          <div className="space-y-1.5">
            {NOTIFICATION_EVENTS.map((event) => {
              const option = EVENT_META[event];
              const checked = events.includes(event);
              return (
                <label
                  key={event}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/8 bg-black/20 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setEvents((current) =>
                        e.target.checked
                          ? [...current, event]
                          : current.filter((value) => value !== event),
                      )
                    }
                    className="mt-0.5 h-4 w-4 accent-violet-500"
                  />
                  <span>
                    <span className="block text-sm text-slate-200">
                      {option.emoji} {option.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {fieldErrors.events ? (
            <p className="mt-1 text-xs text-rose-300">{fieldErrors.events}</p>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || events.length === 0}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  );
}
