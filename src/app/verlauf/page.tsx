import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, History } from "lucide-react";
import { Timeline } from "@/components/Timeline";
import { requireUserPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { SEITE, SEITEN_ORDNUNG, seitenBedingung } from "@/lib/timeline";
import type { ReviewEntry } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Verlauf" };

/**
 * Der Verlauf ueber alle Projekte, fortlaufend.
 *
 * Die erste Seite kommt serverseitig mit, damit sofort etwas dasteht; alles
 * Weitere holt der Knopf per Cursor nach. Anders als der Wochenrueckblick
 * hat diese Seite keine Grenze und kein Fazit – sie laeuft zurueck, solange
 * es Eintraege gibt.
 */
export default async function TimelinePage() {
  const user = await requireUserPage();

  const gefunden = await prisma.activity.findMany({
    where: seitenBedingung(user.id, null),
    orderBy: SEITEN_ORDNUNG,
    // Einen mehr, um zu wissen, ob es weitergeht.
    take: SEITE + 1,
    select: {
      id: true,
      kind: true,
      summary: true,
      createdAt: true,
      project: { select: { id: true, name: true, accent: true } },
      user: { select: { username: true, displayName: true } },
    },
  });

  const weitere = gefunden.length > SEITE;
  const erste: ReviewEntry[] = (weitere ? gefunden.slice(0, SEITE) : gefunden).map((eintrag) => ({
    id: eintrag.id,
    kind: eintrag.kind,
    summary: eintrag.summary,
    createdAt: eintrag.createdAt.toISOString(),
    project: eintrag.project,
    user: eintrag.user,
  }));

  return (
    <div className="space-y-5">
      <header className="fade-up pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-300/70">
          Über alle Projekte
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              <History className="h-6 w-6 text-violet-300" />
              Verlauf
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Alles, was passiert ist – vom Neuesten rückwärts.
            </p>
          </div>

          <Link href="/rueckblick" className="btn btn-ghost px-3 py-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5" />
            Wochenrückblick
          </Link>
        </div>
      </header>

      <Timeline erste={erste} weitere={weitere} />
    </div>
  );
}
