"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  HardDrive,
  ListPlus,
  Loader2,
  Lock,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Tag,
  Unlink,
} from "lucide-react";
import { CiBadge } from "@/components/CiBadge";
import { Heatmap } from "@/components/Heatmap";
import { RepositoryDialog } from "@/components/RepositoryDialog";
import { Sparkline } from "@/components/Sparkline";
import { repoTitle } from "@/lib/git/meta";
import { asArray, asCalendar, asRecord } from "@/types";
import type {
  BranchInfo,
  CommitInfo,
  ConnectionSafe,
  ProjectDetail,
  ReleaseInfo,
  RepositoryWithSnapshot,
  TagInfo,
  TicketInfo,
} from "@/types";
import { cn, formatDateTime, formatNumber, formatRelative } from "@/lib/utils";

const TABS = [
  { key: "pulls", label: "PRs", icon: GitPullRequest },
  { key: "issues", label: "Issues", icon: CircleDot },
  { key: "branches", label: "Branches", icon: GitBranch },
  { key: "tags", label: "Tags", icon: Tag },
  { key: "commits", label: "Commits", icon: GitCommitHorizontal },
  { key: "releases", label: "Releases", icon: Package },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function GitPanel({
  project,
  connections,
}: {
  project: ProjectDetail;
  connections: ConnectionSafe[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("pulls");
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const repositories = project.repositories;
  const [selectedId, setSelectedId] = useState<string | null>(repositories[0]?.id ?? null);

  // Nach dem Entfernen zeigt die Auswahl ins Leere – dann auf das fuehrende
  // zurueckfallen, statt eine leere Ansicht zu zeigen.
  const repository = repositories.find((entry) => entry.id === selectedId) ?? repositories[0] ?? null;

  /** Offene Issues als Aufgaben anlegen – ohne erneuten Abruf beim Provider. */
  async function importIssues() {
    if (!repository) return;
    setImporting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/tasks/from-issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId: repository.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Uebernahme fehlgeschlagen.");
      setMessage({
        ok: true,
        text:
          body.created === 0
            ? `Nichts Neues – alle ${body.skipped} Issues sind bereits als Aufgabe vorhanden.`
            : `${body.created} Aufgabe(n) angelegt${body.skipped ? `, ${body.skipped} uebersprungen` : ""}.`,
      });
      router.refresh();
    } catch (caught) {
      setMessage({ ok: false, text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setImporting(false);
    }
  }

  const snapshot = repository?.snapshot ?? null;
  const branches = asArray<BranchInfo>(snapshot?.branches);
  const tags = asArray<TagInfo>(snapshot?.tags);
  const commits = asArray<CommitInfo>(snapshot?.commits);
  const releases = asArray<ReleaseInfo>(snapshot?.releases);
  const languages = asRecord(snapshot?.languages);
  const pulls = asArray<TicketInfo>(snapshot?.pullRequests);
  const issues = asArray<TicketInfo>(snapshot?.issues);
  const activity = asArray<number>(snapshot?.commitActivity);
  const calendar = asCalendar(snapshot?.commitCalendar);

  /** Ein einzelnes Repository oder – ohne Argument – alle. */
  async function sync(nurDieses?: string) {
    setSyncing(true);
    setMessage(null);
    try {
      const url = nurDieses
        ? `/api/repositories/${nurDieses}/sync`
        : `/api/projects/${project.id}/sync`;
      const response = await fetch(url, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      setMessage({ ok: response.ok, text: payload.message ?? "Unbekannte Antwort." });
      router.refresh();
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setSyncing(false);
    }
  }

  async function removeRepository(entry: RepositoryWithSnapshot) {
    if (
      !window.confirm(
        `„${repoTitle(entry)}“ vom Projekt loesen? Der geholte Stand geht dabei verloren.`,
      )
    ) {
      return;
    }
    await fetch(`/api/repositories/${entry.id}`, { method: "DELETE" }).catch(() => undefined);
    setSelectedId(null);
    router.refresh();
  }

  if (!repository) {
    return (
      <>
        <div className="glass px-5 py-10 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-slate-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-200">Kein Repository verknuepft</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Verknuepfe ein Repository, um Branches, Tags, Commits und Releases hier zu sehen.
            Ein Projekt darf auch mehrere haben – etwa Frontend und Backend.
          </p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Repository verknuepfen
          </button>
        </div>
        <RepositoryDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          projectId={project.id}
          connections={connections}
        />
      </>
    );
  }

  const languageTotal = Object.values(languages).reduce((sum, value) => sum + value, 0);
  const topLanguages = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Auswahl, sobald es mehr als eines gibt. Bei einem einzigen waere eine
          Leiste mit genau einem Knopf nur Ballast. */}
      {repositories.length > 1 ? (
        <div className="glass flex flex-wrap items-center gap-1.5 p-2" role="tablist">
          {repositories.map((entry) => {
            const aktiv = entry.id === repository.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={aktiv}
                onClick={() => setSelectedId(entry.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors",
                  aktiv
                    ? "bg-white/9 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                {entry.syncError ? (
                  <AlertTriangle className="h-3 w-3 text-rose-300" />
                ) : (
                  <GitBranch className="h-3 w-3 text-slate-500" />
                )}
                {repoTitle(entry)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-violet-300"
            aria-label="Weiteres Repository verknuepfen"
            title="Weiteres Repository verknuepfen"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Kopf mit Sync */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-mono text-sm text-slate-100">
              {snapshot?.fullName ?? repoTitle(repository)}
            </h2>
            {snapshot?.visibility ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                {snapshot.visibility === "private" ? (
                  <Lock className="h-2.5 w-2.5" />
                ) : (
                  <ShieldCheck className="h-2.5 w-2.5" />
                )}
                {snapshot.visibility}
              </span>
            ) : null}
            {snapshot?.htmlUrl ? (
              <a
                href={snapshot.htmlUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-slate-500 transition-colors hover:text-violet-300"
                aria-label="Repository oeffnen"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <CiBadge state={snapshot?.ciState} name={snapshot?.ciName} url={snapshot?.ciUrl} />
          </div>
          <p className="mt-1 text-xs text-slate-500" suppressHydrationWarning>
            {repository.lastSyncedAt
              ? `Zuletzt synchronisiert ${formatRelative(repository.lastSyncedAt)} · ${formatDateTime(repository.lastSyncedAt)}`
              : "Noch nie synchronisiert."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {repositories.length > 1 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => sync()}
              disabled={syncing}
              title="Alle Repositories dieses Projekts abgleichen"
            >
              <RefreshCw className="h-4 w-4" />
              Alle
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="btn btn-ghost"
              title="Weiteres Repository verknuepfen"
            >
              <Plus className="h-4 w-4" />
              Repository
            </button>
          )}
          <button
            type="button"
            onClick={() => removeRepository(repository)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            aria-label={`${repoTitle(repository)} vom Projekt loesen`}
            title="Vom Projekt loesen"
          >
            <Unlink className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sync(repository.id)}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Jetzt synchronisieren
          </button>
        </div>
      </div>

      <RepositoryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={project.id}
        connections={connections}
      />

      {message ? (
        <p
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200",
          )}
        >
          {message.text}
        </p>
      ) : null}

      {repository.syncError && !message ? (
        <p className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{repository.syncError}</span>
        </p>
      ) : null}

      {snapshot ? (
        <>
          {/* Kennzahlen */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric icon={Star} label="Stars" value={formatNumber(snapshot.stars)} />
            <Metric icon={GitMerge} label="Forks" value={formatNumber(snapshot.forks)} />
            <Metric
              icon={GitPullRequest}
              label="Offene PRs/MRs"
              value={formatNumber(snapshot.openPullRequests)}
            />
            <Metric
              icon={AlertTriangle}
              label="Offene Issues"
              value={formatNumber(snapshot.openIssues)}
            />
            <Metric icon={GitBranch} label="Branches" value={formatNumber(snapshot.branchCount)} />
            <Metric
              icon={HardDrive}
              label="Groesse"
              value={snapshot.sizeKb > 1024 ? `${Math.round(snapshot.sizeKb / 1024)} MB` : `${snapshot.sizeKb} KB`}
            />
          </div>

          {/* Letzter Commit + Version */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="glass p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Letzter Commit
              </p>
              {snapshot.lastCommitSha ? (
                <>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-200">
                    {snapshot.lastCommitMessage}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[11px] text-violet-200">
                      {snapshot.lastCommitSha.slice(0, 7)}
                    </span>
                    <span>{snapshot.lastCommitAuthor ?? "unbekannt"}</span>
                    <span suppressHydrationWarning>{formatRelative(snapshot.lastCommitAt)}</span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Keine Commit-Daten.</p>
              )}
            </div>

            <div className="glass p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Aktuelle Version
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-2xl text-white">
                  {snapshot.latestTag ?? snapshot.latestRelease ?? "–"}
                </span>
                {snapshot.latestRelease && snapshot.latestRelease !== snapshot.latestTag ? (
                  <span className="text-sm text-slate-400">{snapshot.latestRelease}</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {snapshot.latestReleaseAt
                  ? `Release vom ${formatDateTime(snapshot.latestReleaseAt)}`
                  : `${snapshot.tagCount} Tag${snapshot.tagCount === 1 ? "" : "s"} im Repository`}
              </p>
            </div>
          </div>

          {/* Commit-Aktivitaet */}
          {activity.some((value) => value > 0) ? (
            <div className="glass p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <Activity className="h-3 w-3" />
                  {/* Der Zeitraum richtet sich danach, wie weit die geholten
                      Commits zurueckreichen – hoechstens 30 Tage. */}
                  Commits der letzten {activity.length} Tage
                </p>
                <span className="text-xs tabular-nums text-slate-400">
                  {activity.reduce((sum, value) => sum + value, 0)}
                </span>
              </div>
              <Sparkline values={activity} height={40} />
            </div>
          ) : null}

          {/* Der Jahresueberblick, sobald er einmal geholt wurde. */}
          {calendar ? <Heatmap calendar={calendar} /> : null}

          {/* Sprachen */}
          {languageTotal > 0 ? (
            <div className="glass p-4">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Sprachen
              </p>
              <div className="flex h-2 overflow-hidden rounded-full bg-white/6">
                {topLanguages.map(([name, bytes], index) => (
                  <span
                    key={name}
                    title={`${name} – ${Math.round((bytes / languageTotal) * 100)}%`}
                    style={{
                      width: `${(bytes / languageTotal) * 100}%`,
                      backgroundColor: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                {topLanguages.map(([name, bytes], index) => (
                  <span key={name} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length] }}
                    />
                    {name}
                    <span className="text-slate-600">
                      {Math.round((bytes / languageTotal) * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Listen */}
          <div className="glass overflow-hidden">
            <div className="flex flex-wrap gap-1 border-b border-white/6 p-2">
              {TABS.map(({ key, label, icon: Icon }) => {
                const count = {
                  pulls: pulls.length,
                  issues: issues.length,
                  branches: branches.length,
                  tags: tags.length,
                  commits: commits.length,
                  releases: releases.length,
                }[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                      tab === key
                        ? "bg-white/9 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span className="tabular-nums text-slate-600">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {tab === "pulls" ? (
                <TicketList
                  tickets={pulls}
                  empty="Keine offenen Pull oder Merge Requests."
                  icon={GitPullRequest}
                />
              ) : null}
              {tab === "issues" ? (
                <>
                  {issues.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 bg-white/2 px-4 py-2">
                      <p className="text-[11px] text-slate-500">
                        Aus offenen Issues Aufgaben machen. Bereits uebernommene werden
                        uebersprungen.
                      </p>
                      <button
                        type="button"
                        className="btn btn-ghost px-2.5 py-1 text-[11px]"
                        onClick={importIssues}
                        disabled={importing}
                      >
                        {importing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ListPlus className="h-3 w-3" />
                        )}
                        Als Aufgaben uebernehmen
                      </button>
                    </div>
                  ) : null}
                  <TicketList tickets={issues} empty="Keine offenen Issues." icon={CircleDot} />
                </>
              ) : null}
              {tab === "branches" ? <BranchList branches={branches} /> : null}
              {tab === "tags" ? <TagList tags={tags} /> : null}
              {tab === "commits" ? <CommitList commits={commits} /> : null}
              {tab === "releases" ? <ReleaseList releases={releases} /> : null}
            </div>
          </div>
        </>
      ) : (
        <div className="glass px-5 py-10 text-center text-sm text-slate-500">
          Noch keine Daten geladen. Mit „Jetzt synchronisieren“ den ersten Snapshot holen.
        </div>
      )}
    </div>
  );
}

const LANGUAGE_COLORS = ["#a78bfa", "#22d3ee", "#34d399", "#fbbf24", "#f472b6"];

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{value}</p>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/4 px-4 py-2.5 last:border-b-0 hover:bg-white/3">
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-xs text-slate-500">{text}</p>;
}

function TicketList({
  tickets,
  empty,
  icon: Icon,
}: {
  tickets: TicketInfo[];
  empty: string;
  icon: typeof GitPullRequest;
}) {
  if (tickets.length === 0) return <Empty text={empty} />;
  return (
    <div>
      {tickets.map((ticket) => (
        <Row key={`${ticket.number}-${ticket.title}`}>
          <div className="flex min-w-0 items-start gap-2">
            <Icon
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                ticket.draft ? "text-slate-600" : "text-emerald-400/70",
              )}
            />
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-200">
                {ticket.title}
                {ticket.draft ? (
                  <span className="ml-1.5 rounded bg-slate-500/15 px-1 py-0.5 text-[10px] text-slate-400">
                    Entwurf
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                <span className="font-mono text-slate-600">#{ticket.number}</span>
                <span>{ticket.author ?? "unbekannt"}</span>
                {ticket.labels.slice(0, 3).map((label) => (
                  <span key={label} className="rounded bg-white/6 px-1 py-0.5 text-[10px]">
                    {label}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
            <span suppressHydrationWarning>{formatRelative(ticket.createdAt)}</span>
            {ticket.url ? (
              <a
                href={ticket.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-slate-600 transition-colors hover:text-violet-300"
                aria-label="Im Git-System oeffnen"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </Row>
      ))}
    </div>
  );
}

function BranchList({ branches }: { branches: BranchInfo[] }) {
  if (branches.length === 0) return <Empty text="Keine Branches gefunden." />;
  return (
    <div>
      {branches.map((branch) => (
        <Row key={branch.name}>
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="truncate font-mono text-xs text-slate-200">{branch.name}</span>
            {branch.isDefault ? (
              <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200">
                default
              </span>
            ) : null}
            {branch.protected ? (
              <Lock className="h-3 w-3 shrink-0 text-amber-300/70" />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate-500">
            {branch.lastCommitAt ? (
              <span suppressHydrationWarning>{formatRelative(branch.lastCommitAt)}</span>
            ) : null}
            {branch.sha ? (
              <span className="font-mono text-slate-600">{branch.sha.slice(0, 7)}</span>
            ) : null}
          </div>
        </Row>
      ))}
    </div>
  );
}

function TagList({ tags }: { tags: TagInfo[] }) {
  if (tags.length === 0) return <Empty text="Keine Tags vorhanden." />;
  return (
    <div>
      {tags.map((tag) => (
        <Row key={tag.name}>
          <div className="flex min-w-0 items-center gap-2">
            <Tag className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="truncate font-mono text-xs text-slate-200">{tag.name}</span>
            {tag.message ? (
              <span className="truncate text-[11px] text-slate-500">{tag.message}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate-500">
            {tag.date ? <span suppressHydrationWarning>{formatRelative(tag.date)}</span> : null}
            {tag.sha ? (
              <span className="font-mono text-slate-600">{tag.sha.slice(0, 7)}</span>
            ) : null}
          </div>
        </Row>
      ))}
    </div>
  );
}

function CommitList({ commits }: { commits: CommitInfo[] }) {
  if (commits.length === 0) return <Empty text="Keine Commits geladen." />;
  return (
    <div>
      {commits.map((commit) => (
        <Row key={commit.sha}>
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-200">{commit.message}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono text-violet-300/80">{commit.shortSha}</span>
              <span>{commit.author ?? "unbekannt"}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
            <span suppressHydrationWarning>{formatRelative(commit.date)}</span>
            {commit.url ? (
              <a
                href={commit.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-slate-600 transition-colors hover:text-violet-300"
                aria-label="Commit oeffnen"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </Row>
      ))}
    </div>
  );
}

function ReleaseList({ releases }: { releases: ReleaseInfo[] }) {
  if (releases.length === 0) return <Empty text="Keine Releases veroeffentlicht." />;
  return (
    <div>
      {releases.map((release) => (
        <Row key={`${release.tag}-${release.name}`}>
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="truncate text-xs text-slate-200">{release.name}</span>
            <span className="shrink-0 rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {release.tag}
            </span>
            {release.prerelease ? (
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                pre
              </span>
            ) : null}
            {release.draft ? (
              <span className="shrink-0 rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-300">
                draft
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
            <span suppressHydrationWarning>{formatRelative(release.publishedAt)}</span>
            {release.url ? (
              <a
                href={release.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-slate-600 transition-colors hover:text-violet-300"
                aria-label="Release oeffnen"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </Row>
      ))}
    </div>
  );
}
