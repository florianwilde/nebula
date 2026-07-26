"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { ConnectionSafe, RepoListEntry, RepositoryWithSnapshot } from "@/types";

/**
 * Ein weiteres Repository mit einem Projekt verknuepfen – oder ein
 * vorhandenes umbenennen und umhaengen.
 *
 * Beim Anlegen des Projekts genuegt der Projektdialog: dort setzen die
 * Git-Felder das erste Repository. Alles darueber hinaus laeuft hier.
 */

interface FormState {
  label: string;
  connectionId: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  autoSync: boolean;
}

const EMPTY: FormState = {
  label: "",
  connectionId: "",
  repoUrl: "",
  repoOwner: "",
  repoName: "",
  autoSync: true,
};

export function RepositoryDialog({
  open,
  onClose,
  projectId,
  connections,
  repository,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  connections: ConnectionSafe[];
  /** Vorhandenes = Bearbeiten, sonst Verknuepfen. */
  repository?: RepositoryWithSnapshot | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repos, setRepos] = useState<RepoListEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const isEdit = Boolean(repository);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPickerOpen(false);
    setRepos([]);
    setFilter("");
    setForm(
      repository
        ? {
            label: repository.label ?? "",
            connectionId: repository.connectionId ?? "",
            repoUrl: repository.repoUrl ?? "",
            repoOwner: repository.repoOwner ?? "",
            repoName: repository.repoName ?? "",
            autoSync: repository.autoSync,
          }
        : EMPTY,
    );
  }, [open, repository]);

  const gefiltert = useMemo(() => {
    const needle = filter.toLowerCase().trim();
    if (!needle) return repos.slice(0, 60);
    return repos.filter((repo) => repo.fullPath.toLowerCase().includes(needle)).slice(0, 60);
  }, [repos, filter]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function loadRepos() {
    if (!form.connectionId) {
      setError("Bitte zuerst eine Git-Verbindung auswaehlen.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/connections/${form.connectionId}/repos`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Repos konnten nicht geladen werden.");
      setRepos(payload.repos ?? []);
      setPickerOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  function pick(repo: RepoListEntry) {
    setForm((previous) => ({
      ...previous,
      repoUrl: repo.htmlUrl,
      repoOwner: repo.owner,
      repoName: repo.name,
    }));
    setPickerOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        isEdit ? `/api/repositories/${repository?.id}` : `/api/projects/${projectId}/repositories`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: form.label,
            connectionId: form.connectionId || null,
            repoUrl: form.repoUrl,
            repoOwner: form.repoOwner,
            repoName: form.repoName,
            autoSync: form.autoSync,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={isEdit ? "Repository bearbeiten" : "Repository verknuepfen"}
      description={
        isEdit
          ? "Zeigt das Repository woandershin, wird der geholte Stand verworfen."
          : "Ein Projekt darf mehrere Repositories haben – etwa Frontend und Backend."
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="repo-label">
              Bezeichnung (optional)
            </label>
            <input
              id="repo-label"
              className="field"
              value={form.label}
              onChange={(event) => update("label", event.target.value)}
              placeholder="Frontend"
              maxLength={80}
            />
            <p className="mt-1 text-xs text-slate-500">
              Ohne Angabe steht schlicht owner/name da.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="repo-connection">
              Verbindung
            </label>
            <select
              id="repo-connection"
              className="field"
              value={form.connectionId}
              onChange={(event) => update("connectionId", event.target.value)}
            >
              <option value="">– keine –</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} ({connection.provider})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={loadRepos}
              disabled={loading || !form.connectionId}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Repos laden
            </button>
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="repo-url">
              Repository-URL
            </label>
            <input
              id="repo-url"
              className="field"
              value={form.repoUrl}
              onChange={(event) => update("repoUrl", event.target.value)}
              placeholder="https://github.com/user/repo"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="repo-owner">
              Owner / Gruppe
            </label>
            <input
              id="repo-owner"
              className="field font-mono text-xs"
              value={form.repoOwner}
              onChange={(event) => update("repoOwner", event.target.value)}
              placeholder="wird aus der URL abgeleitet"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="repo-name">
              Repository
            </label>
            <input
              id="repo-name"
              className="field font-mono text-xs"
              value={form.repoName}
              onChange={(event) => update("repoName", event.target.value)}
              placeholder="wird aus der URL abgeleitet"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={form.autoSync}
            onChange={(event) => update("autoSync", event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-violet-500"
          />
          <span>
            Am automatischen Abgleich teilnehmen
            <span className="mt-0.5 block text-[11px] text-slate-600">
              Wirkt nur, wenn der Abgleich im Adminbereich eingeschaltet ist. Manuell
              synchronisieren geht unabhaengig davon immer.
            </span>
          </span>
        </label>

        {pickerOpen ? (
          <div className="rounded-xl border border-white/8 bg-[#080a18]/70">
            <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <input
                className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                placeholder={`${repos.length} Repositories durchsuchen…`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <ul className="max-h-56 overflow-y-auto p-1">
              {gefiltert.map((repo) => (
                <li key={repo.fullPath}>
                  <button
                    type="button"
                    onClick={() => pick(repo)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/6"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs text-slate-200">
                        {repo.fullPath}
                      </span>
                      {repo.description ? (
                        <span className="block truncate text-[11px] text-slate-500">
                          {repo.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-slate-600">
                      {repo.visibility}
                    </span>
                  </button>
                </li>
              ))}
              {gefiltert.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-slate-500">Keine Treffer.</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Speichern" : "Verknuepfen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
