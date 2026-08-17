import type { Repository } from "@prisma/client";
import { recordActivity, shorten } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { clientForConnection, createClient, parseRepoUrl } from "@/lib/git";
import type { GitClient } from "@/lib/git/types";
import { notifyAfterSync } from "@/lib/notify";
import { repoTitle } from "@/lib/repositories";
import { reconcileLinkedIssues } from "@/lib/tasks/issues";
import type { RepoSnapshotData } from "@/lib/git/types";

export interface SyncResult {
  ok: boolean;
  message: string;
  fetchedAt?: string;
}

/**
 * Holt den aktuellen Stand eines Repositories und schreibt ihn als Snapshot
 * in die Datenbank. Fehler werden am Repository vermerkt statt geworfen,
 * damit ein kaputtes Repo nicht das ganze Dashboard blockiert.
 */
export async function syncRepository(repositoryId: string): Promise<SyncResult> {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { connection: true },
  });

  if (!repository) {
    return { ok: false, message: "Repository nicht gefunden." };
  }

  const ref = resolveRepoRef(repository);
  if (!ref) {
    return {
      ok: false,
      message: "Kein Repository hinterlegt – bitte Repo-URL oder Owner/Name setzen.",
    };
  }

  let client;
  if (repository.connection) {
    client = clientForConnection(repository.connection);
  } else {
    // Ohne gespeicherte Verbindung: anonymer Zugriff anhand der URL.
    const parsed = repository.repoUrl ? parseRepoUrl(repository.repoUrl) : null;
    if (!parsed) {
      return {
        ok: false,
        message: "Keine Git-Verbindung ausgewaehlt und die Repo-URL ist nicht auswertbar.",
      };
    }
    client = createClient({
      provider: parsed.guessedProvider,
      baseUrl: parsed.baseUrl,
      token: null,
    });
  }

  try {
    const data = await client.fetchRepo(ref);
    await persistSnapshot(repository, data);
    // Erst nach dem Snapshot: die Zeile muss existieren, bevor Kalender und
    // README hineingeschrieben werden koennen.
    await maybeRefreshCalendar(repository.id, client, ref);
    await maybeRefreshReadme(repository.id, client, ref);

    /**
     * Verknuepfte Aufgaben nachziehen: was in Git geschlossen wurde, wird
     * hier abgehakt. Der Webhook macht das sofort – ist keiner eingerichtet
     * oder faellt er aus, greift der Abgleich.
     *
     * Die offenen Issues aus dem gerade geholten Snapshot gehen mit hinein:
     * fuer jede Nummer, die dort steht, ist die Nachfrage gespart.
     */
    const abgehakt = await reconcileLinkedIssues(
      repository.id,
      client,
      ref,
      data.issues.map((issue) => issue.number),
    );

    // Nach dem Speichern, damit die Meldung den neuen Stand sieht.
    await notifyAfterSync(repository.id);
    return {
      ok: true,
      message:
        `Snapshot aktualisiert: ${data.branches.length} Branches, ${data.tags.length} Tags.` +
        (abgehakt > 0
          ? ` ${abgehakt} Aufgabe(n) abgehakt, weil das Issue geschlossen wurde.`
          : ""),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.repository.update({
      where: { id: repository.id },
      data: {
        syncError: message,
        lastSyncedAt: new Date(),
        // Zaehler fuers Zurueckhalten beim automatischen Abgleich.
        syncFailureCount: { increment: 1 },
      },
    });
    // Nur der Uebergang in den Fehlerzustand kommt in den Verlauf. Ein Repo
    // mit abgelaufenem Token schlaegt sonst stuendlich neu auf.
    if (!repository.syncError) {
      await recordActivity({
        projectId: repository.projectId,
        kind: "SYNC_FAILED",
        summary: `Abgleich von ${repoTitle(repository)} fehlgeschlagen: ${shorten(message, 100)}`,
      });
    }
    await notifyAfterSync(repository.id);
    return { ok: false, message };
  }
}

export interface ProjectSyncResult extends SyncResult {
  /** Ergebnis je Repository – auch dann, wenn nur eines dranhaengt. */
  repositories: Array<{ id: string; title: string } & SyncResult>;
}

/**
 * Gleicht alle Repositories eines Projekts ab, nacheinander.
 *
 * Nacheinander und nicht parallel: die Repos eines Projekts liegen meist
 * beim selben Anbieter, und ein Schwung gleichzeitiger Anfragen ist genau
 * das, worauf Rate-Limits reagieren.
 */
export async function syncProject(projectId: string): Promise<ProjectSyncResult> {
  const repositories = await prisma.repository.findMany({
    where: { projectId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  if (repositories.length === 0) {
    return {
      ok: false,
      message: "Kein Repository hinterlegt – bitte eines verknuepfen.",
      repositories: [],
    };
  }

  const ergebnisse = [];
  for (const repository of repositories) {
    ergebnisse.push({
      id: repository.id,
      title: repoTitle(repository),
      ...(await syncRepository(repository.id)),
    });
  }

  const fehler = ergebnisse.filter((entry) => !entry.ok);

  return {
    // Erfolgreich nur, wenn kein einziges Repo gescheitert ist. Ein "teilweise
    // ok" waere eine Meldung, die man wegklickt, ohne hinzusehen.
    ok: fehler.length === 0,
    message:
      fehler.length === 0
        ? ergebnisse.length === 1
          ? ergebnisse[0].message
          : `${ergebnisse.length} Repositories abgeglichen.`
        : fehler.map((entry) => `${entry.title}: ${entry.message}`).join(" · "),
    fetchedAt: new Date().toISOString(),
    repositories: ergebnisse,
  };
}

/** Wie lange ein geholter Kalender genuegt. */
const CALENDAR_TTL_MS = 20 * 60 * 60 * 1000;

/**
 * Holt die Jahresuebersicht fuer die Heatmap – hoechstens einmal am Tag.
 *
 * Sie kostet zusaetzliche Aufrufe, bei GitLab und Gitea sogar mehrere. An
 * einem Jahresueberblick aendert sich von Stunde zu Stunde aber nichts
 * Sichtbares, und der Abgleich laeuft im Zweifel stuendlich.
 *
 * Fehler bleiben hier: der Kalender ist Beiwerk. Wenn er nicht zu holen ist,
 * soll deshalb nicht der ganze Abgleich als gescheitert gelten.
 */
async function maybeRefreshCalendar(
  repositoryId: string,
  client: GitClient,
  ref: { owner: string; name: string },
): Promise<void> {
  try {
    const snapshot = await prisma.repoSnapshot.findUnique({
      where: { repositoryId },
      select: { commitCalendarAt: true },
    });

    const zuletzt = snapshot?.commitCalendarAt?.getTime() ?? 0;
    if (Date.now() - zuletzt < CALENDAR_TTL_MS) return;

    const calendar = await client.fetchCommitCalendar(ref);

    // Nichts erhalten: entweder rechnet GitHub die Statistik gerade erst,
    // oder das Repository hat keine Commits. Der Zeitstempel bleibt dann
    // ungesetzt, damit es der naechste Abgleich erneut versucht – ihn hier zu
    // setzen wuerde die Heatmap fuer einen Tag unterdruecken, obwohl sie
    // vielleicht schon in Minuten bereitsteht.
    if (!calendar) return;

    await prisma.repoSnapshot.update({
      where: { repositoryId },
      data: {
        commitCalendar: calendar as unknown as object,
        commitCalendarAt: new Date(),
      },
    });
  } catch (error) {
    // Rate-Limit, Zeitueberschreitung, Ausfall: der Kalender ist Beiwerk und
    // soll den Abgleich nicht scheitern lassen. Ohne Zeitstempel versucht es
    // der naechste Durchgang von selbst wieder.
    console.error("[nebula] Commit-Kalender konnte nicht geholt werden:", error);
  }
}

/**
 * Holt das README – wie der Kalender hoechstens einmal am Tag.
 *
 * Ein eigener Zeitstempel und nicht der des Kalenders: schlaegt das eine
 * fehl, soll das andere nicht mit blockiert werden.
 */
async function maybeRefreshReadme(
  repositoryId: string,
  client: GitClient,
  ref: { owner: string; name: string },
): Promise<void> {
  try {
    const snapshot = await prisma.repoSnapshot.findUnique({
      where: { repositoryId },
      select: { readmeAt: true },
    });

    const zuletzt = snapshot?.readmeAt?.getTime() ?? 0;
    if (Date.now() - zuletzt < CALENDAR_TTL_MS) return;

    const readme = await client.fetchReadme(ref);

    // Kein README im Repository: das ist eine Auskunft, kein Fehlschlag.
    // Der Zeitstempel wird gesetzt, damit nicht jeder Abgleich erneut sucht,
    // und ein etwaiger alter Stand verschwindet.
    await prisma.repoSnapshot.update({
      where: { repositoryId },
      data: {
        readme: readme?.content ?? null,
        readmePath: readme?.path ?? null,
        readmeBaseUrl: readme?.baseUrl ?? null,
        readmeAt: new Date(),
      },
    });
  } catch (error) {
    // Wie beim Kalender: Beiwerk. Ohne Zeitstempel versucht es der naechste
    // Durchgang von selbst wieder.
    console.error("[nebula] README konnte nicht geholt werden:", error);
  }
}

/** Owner/Name aus den Feldern oder ersatzweise aus der URL bestimmen. */
export function resolveRepoRef(
  repository: Pick<Repository, "repoOwner" | "repoName" | "repoUrl">,
) {
  if (repository.repoOwner && repository.repoName) {
    return { owner: repository.repoOwner, name: repository.repoName };
  }
  if (repository.repoUrl) {
    const parsed = parseRepoUrl(repository.repoUrl);
    if (parsed) return { owner: parsed.owner, name: parsed.name };
  }
  return null;
}

/**
 * Haelt neue Commits im Verlauf fest.
 *
 * Der Abgleich laeuft im Zweifel stuendlich, ein Eintrag je Durchlauf waere
 * also unbrauchbar. Vermerkt wird nur, wenn sich der letzte Commit tatsaechlich
 * geaendert hat – und beim allerersten Abgleich gar nicht: dass ein Repo
 * Commits hat, ist keine Neuigkeit.
 */
async function noteNewCommits(
  repository: Repository,
  vorher: string | null,
  data: RepoSnapshotData,
) {
  const neuester = data.commits[0]?.sha ?? null;
  if (!neuester || !vorher || neuester === vorher) return;

  // Wie viele Commits liegen zwischen altem und neuem Stand? Steht der alte
  // nicht mehr in der Liste, waren es mehr als eine Seite – dann lieber ohne
  // Zahl als mit einer falschen.
  const index = data.commits.findIndex((commit) => commit.sha === vorher);
  const anzahl = index > 0 ? index : null;
  const wo = data.defaultBranch ? `${repoTitle(repository)} · ${data.defaultBranch}` : repoTitle(repository);
  const betreff = shorten(data.commits[0]?.message ?? "", 60);

  await recordActivity({
    projectId: repository.projectId,
    kind: "REPO_COMMITS",
    summary:
      anzahl === null
        ? `Neue Commits in ${wo}: ${betreff}`
        : `${anzahl} neue${anzahl === 1 ? "r" : ""} Commit${anzahl === 1 ? "" : "s"} in ${wo}: ${betreff}`,
    meta: { repositoryId: repository.id, from: vorher, to: neuester, count: anzahl },
  });
}

async function persistSnapshot(repository: Repository, data: RepoSnapshotData) {
  const latestCommit = data.commits[0] ?? null;
  const latestRelease =
    data.releases.find((release) => !release.draft && !release.prerelease) ?? data.releases[0] ?? null;
  const latestTag = data.tags[0]?.name ?? latestRelease?.tag ?? null;

  const payload = {
    fullName: data.fullName,
    description: data.description,
    defaultBranch: data.defaultBranch,
    htmlUrl: data.htmlUrl,
    visibility: data.visibility,
    stars: data.stars,
    forks: data.forks,
    openIssues: data.openIssues,
    openPullRequests: data.openPullRequests,
    sizeKb: data.sizeKb,
    lastCommitSha: latestCommit?.sha ?? null,
    lastCommitMessage: latestCommit?.message ?? null,
    lastCommitAuthor: latestCommit?.author ?? null,
    lastCommitAt: latestCommit?.date ? new Date(latestCommit.date) : null,
    latestTag,
    latestRelease: latestRelease?.name ?? null,
    latestReleaseAt: latestRelease?.publishedAt ? new Date(latestRelease.publishedAt) : null,
    branchCount: data.branches.length,
    tagCount: data.tags.length,
    branches: data.branches as unknown as object,
    tags: data.tags as unknown as object,
    commits: data.commits as unknown as object,
    releases: data.releases as unknown as object,
    languages: data.languages as unknown as object,
    pullRequests: data.pullRequests as unknown as object,
    issues: data.issues as unknown as object,
    commitActivity: data.commitActivity as unknown as object,
    ciState: data.ci?.state ?? null,
    ciName: data.ci?.name ?? null,
    ciBranch: data.ci?.branch ?? null,
    ciUrl: data.ci?.url ?? null,
    ciFinishedAt: data.ci?.finishedAt ? new Date(data.ci.finishedAt) : null,
    pushedAt: data.pushedAt ? new Date(data.pushedAt) : null,
    fetchedAt: new Date(),
  };

  // Vor dem Ueberschreiben lesen – danach ist der alte Stand weg.
  const vorher = await prisma.repoSnapshot.findUnique({
    where: { repositoryId: repository.id },
    select: { lastCommitSha: true },
  });

  await prisma.$transaction([
    prisma.repoSnapshot.upsert({
      where: { repositoryId: repository.id },
      create: { repositoryId: repository.id, ...payload },
      update: payload,
    }),
    prisma.repository.update({
      where: { id: repository.id },
      data: {
        lastSyncedAt: new Date(),
        syncError: null,
        syncFailureCount: 0,
        defaultBranch: data.defaultBranch,
        repoUrl: data.htmlUrl ?? undefined,
      },
    }),
    // Das Projekt mit anfassen. Solange die Git-Felder daran hingen, geschah
    // das nebenbei; jetzt muss es ausdruecklich passieren, sonst faellt ein
    // regelmaessig abgeglichenes Projekt in der Sortierung nach hinten.
    prisma.project.update({
      where: { id: repository.projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  await noteNewCommits(repository, vorher?.lastCommitSha ?? null, data);
}
