"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Search } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { Modal } from "@/components/ui/Modal";
import { ACCENTS, PRIORITY_META, STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn, parseTags } from "@/lib/utils";
import type { ConnectionSafe, ProjectListItem, RepoListEntry } from "@/types";

interface ProjectDialogProps {
  open: boolean;
  onClose: () => void;
  connections: ConnectionSafe[];
  /** Vorhandenes Projekt = Bearbeiten, sonst Anlegen. */
  project?: ProjectListItem | null;
}

interface FormState {
  name: string;
  summary: string;
  description: string;
  status: ProjectStatus;
  priority: number;
  progress: number;
  accent: string;
  tags: string;
  favorite: boolean;
  connectionId: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  autoSync: boolean;
}

const EMPTY: FormState = {
  name: "",
  summary: "",
  description: "",
  status: "IDEA",
  priority: 2,
  progress: 0,
  accent: "violet",
  tags: "",
  favorite: false,
  connectionId: "",
  repoUrl: "",
  repoOwner: "",
  repoName: "",
  autoSync: true,
};

export function ProjectDialog({ open, onClose, connections, project }: ProjectDialogProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [repos, setRepos] = useState<RepoListEntry[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);

  const isEdit = Boolean(project);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setRepoPickerOpen(false);
    setRepos([]);
    setRepoError(null);
    setForm(
      project
        ? {
            name: project.name,
            summary: project.summary ?? "",
            description: project.description ?? "",
            status: project.status,
            priority: project.priority,
            progress: project.progress,
            accent: project.accent,
            tags: project.tags.join(", "),
            favorite: project.favorite,
            connectionId: project.connectionId ?? "",
            repoUrl: project.repoUrl ?? "",
            repoOwner: project.repoOwner ?? "",
            repoName: project.repoName ?? "",
            autoSync: project.autoSync,
          }
        : EMPTY,
    );
  }, [open, project]);

  const filteredRepos = useMemo(() => {
    const needle = repoFilter.toLowerCase().trim();
    if (!needle) return repos.slice(0, 60);
    return repos.filter((repo) => repo.fullPath.toLowerCase().includes(needle)).slice(0, 60);
  }, [repos, repoFilter]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function loadRepos() {
    if (!form.connectionId) {
      setRepoError("Bitte zuerst eine Git-Verbindung auswaehlen.");
      return;
    }
    setReposLoading(true);
    setRepoError(null);
    try {
      const response = await fetch(`/api/connections/${form.connectionId}/repos`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Repos konnten nicht geladen werden.");
      setRepos(payload.repos ?? []);
      setRepoPickerOpen(true);
    } catch (caught) {
      setRepoError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReposLoading(false);
    }
  }

  function pickRepo(repo: RepoListEntry) {
    setForm((previous) => ({
      ...previous,
      repoUrl: repo.htmlUrl,
      repoOwner: repo.owner,
      repoName: repo.name,
      name: previous.name || repo.name,
      summary: previous.summary || (repo.description ?? ""),
    }));
    setRepoPickerOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const body = {
      name: form.name,
      summary: form.summary,
      description: form.description,
      status: form.status,
      priority: Number(form.priority),
      progress: Number(form.progress),
      accent: form.accent,
      tags: parseTags(form.tags),
      favorite: form.favorite,
      connectionId: form.connectionId || null,
      repoUrl: form.repoUrl,
      repoOwner: form.repoOwner,
      repoName: form.repoName,
      autoSync: form.autoSync,
    };

    try {
      const response = await fetch(
        isEdit ? `/api/projects/${project?.id}` : "/api/projects",
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
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={isEdit ? "Projekt bearbeiten" : "Neues Projekt"}
      description={
        isEdit
          ? "Aenderungen wirken sofort im Board."
          : "Eine reine Idee reicht – Repo und Details lassen sich jederzeit nachtragen."
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="project-name">
              Name *
            </label>
            <input
              id="project-name"
              className="field"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="z. B. Pixelgarten"
              required
              maxLength={120}
              autoFocus
            />
            {fieldErrors.name ? (
              <p className="mt-1 text-xs text-rose-300">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="project-summary">
              Kurzbeschreibung
            </label>
            <input
              id="project-summary"
              className="field"
              value={form.summary}
              onChange={(event) => update("summary", event.target.value)}
              placeholder="Ein Satz, der auf die Karte passt"
              maxLength={280}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="project-description">
              Beschreibung / Ideenskizze
            </label>
            <textarea
              id="project-description"
              className="field min-h-28 resize-y"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Worum geht es? Was ist der Reiz? Welcher Stack?"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="project-status">
              Status
            </label>
            <select
              id="project-status"
              className="field"
              value={form.status}
              onChange={(event) => update("status", event.target.value as ProjectStatus)}
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="project-priority">
              Prioritaet
            </label>
            <select
              id="project-priority"
              className="field"
              value={form.priority}
              onChange={(event) => update("priority", Number(event.target.value))}
            >
              {Object.entries(PRIORITY_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="project-progress">
              Fortschritt: {form.progress}%
            </label>
            <input
              id="project-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={(event) => update("progress", Number(event.target.value))}
              className="range"
              style={{ "--fill": `${form.progress}%` } as React.CSSProperties}
            />
          </div>

          <div className="sm:col-span-2">
            <span className="field-label">Akzentfarbe</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACCENTS).map(([key, accent]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => update("accent", key)}
                  aria-label={accent.label}
                  title={accent.label}
                  className={cn(
                    "h-8 w-8 rounded-lg transition-transform",
                    form.accent === key
                      ? "scale-110 ring-2 ring-white/70"
                      : "opacity-70 hover:scale-105 hover:opacity-100",
                  )}
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="project-tags">
              Tags (kommagetrennt)
            </label>
            <input
              id="project-tags"
              className="field"
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              placeholder="next.js, spiel, experiment"
            />
          </div>
        </div>

        {/* ── Git ────────────────────────────────────────────── */}
        <div className="glass-soft space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-200">Git-Anbindung (optional)</h3>
            <button
              type="button"
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              onClick={loadRepos}
              disabled={reposLoading || !form.connectionId}
            >
              {reposLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Repos laden
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="project-connection">
                Verbindung
              </label>
              <select
                id="project-connection"
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
              {connections.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  Noch keine Verbindung angelegt – unter „Git-Verbindungen“ hinzufuegen.
                </p>
              ) : null}
            </div>

            <div>
              <label className="field-label" htmlFor="project-repo-url">
                Repository-URL
              </label>
              <input
                id="project-repo-url"
                className="field"
                value={form.repoUrl}
                onChange={(event) => update("repoUrl", event.target.value)}
                placeholder="https://github.com/user/repo"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="project-repo-owner">
                Owner / Gruppe
              </label>
              <input
                id="project-repo-owner"
                className="field font-mono text-xs"
                value={form.repoOwner}
                onChange={(event) => update("repoOwner", event.target.value)}
                placeholder="wird aus der URL abgeleitet"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="project-repo-name">
                Repository
              </label>
              <input
                id="project-repo-name"
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

          {repoError ? <p className="text-xs text-rose-300">{repoError}</p> : null}

          {repoPickerOpen ? (
            <div className="rounded-xl border border-white/8 bg-[#080a18]/70">
              <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input
                  className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                  placeholder={`${repos.length} Repositories durchsuchen…`}
                  value={repoFilter}
                  onChange={(event) => setRepoFilter(event.target.value)}
                />
              </div>
              <ul className="max-h-56 overflow-y-auto p-1">
                {filteredRepos.map((repo) => (
                  <li key={repo.fullPath}>
                    <button
                      type="button"
                      onClick={() => pickRepo(repo)}
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
                {filteredRepos.length === 0 ? (
                  <li className="px-3 py-4 text-center text-xs text-slate-500">
                    Keine Treffer.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(event) => update("favorite", event.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            Als Favorit anpinnen
          </label>

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Speichern" : "Projekt anlegen"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
