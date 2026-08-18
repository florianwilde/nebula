import type { Metadata } from "next";
import {
  AdminManager,
  type AdminData,
  type AutoSyncReport,
} from "@/components/admin/AdminManager";
import { requireAdminPage } from "@/lib/auth/guard";
import { getAppSettings } from "@/lib/auth/settings";
import { userSafeSelect } from "@/lib/auth/users";
import { APP_URL, WEBAUTHN_AVAILABLE } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Admin-Einstellungen" };
}

export default async function AdminPage() {
  const admin = await requireAdminPage();

  const [settings, users, eligible, staleListeners, laengsteSpalte] = await Promise.all([
    getAppSettings(),
    prisma.user.findMany({
      select: userSafeSelect,
      orderBy: [{ role: "asc" }, { username: "asc" }],
    }),
    // Bewusst ueber alle Konten: der Abgleich ist ein Serverauftrag, keine
    // Dateneinsicht. Gezaehlt wird nur, nicht gelesen.
    // Gezaehlt werden Repositories, nicht Projekte: sie sind die Einheit, in
    // der abgeglichen und begrenzt wird.
    prisma.repository.count({
      where: {
        autoSync: true,
        OR: [
          { AND: [{ repoOwner: { not: null } }, { repoName: { not: null } }] },
          { repoUrl: { not: null } },
        ],
      },
    }),
    prisma.notificationTarget.count({
      where: { isActive: true, events: { has: "PROJECT_STALE" } },
    }),
    // Laengste Spalte ueber alle Projekte. Ohne diese Zahl steht die
    // Einstellung im Leeren: eine Grenze von 15 sagt nichts, wenn die
    // groesste Spalte im Bestand aus drei Karten besteht.
    //
    // Wie beim Abgleich bewusst ueber alle Konten – gezaehlt wird nur, es
    // wird nichts gelesen und nichts zugeordnet.
    prisma.task.groupBy({
      by: ["projectId", "status"],
      _count: { _all: true },
      orderBy: { _count: { projectId: "desc" } },
      take: 1,
    }),
  ]);

  const data: AdminData = {
    mode: settings.mode,
    allowRegistration: settings.allowRegistration,
    users,
    currentUserId: admin.id,
    appUrl: APP_URL,
    passkeysAvailable: WEBAUTHN_AVAILABLE,
    autoSync: {
      enabled: settings.autoSyncEnabled,
      intervalMinutes: settings.autoSyncIntervalMinutes,
      activeOnly: settings.autoSyncActiveOnly,
      batchSize: settings.autoSyncBatchSize,
      lastRunAt: settings.lastAutoSyncAt,
      lastReport: (settings.lastAutoSyncReport as AutoSyncReport | null) ?? null,
      eligible,
    },
    stale: {
      afterDays: settings.staleAfterDays,
      lastCheckAt: settings.lastStaleCheckAt,
      listeners: staleListeners,
    },
    tasks: {
      columnLimit: settings.taskColumnLimit,
      laengsteSpalte: laengsteSpalte[0]?._count._all ?? 0,
    },
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pt-4">
      <header className="fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-300/70">
          Administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Admin-Einstellungen
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Betriebsart, automatischer Abgleich und Benutzerkonten.
        </p>
      </header>

      <AdminManager data={data} />
    </div>
  );
}
