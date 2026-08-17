import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarRange } from "lucide-react";
import { WeeklyReview } from "@/components/WeeklyReview";
import { requireUserPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { tagesschluessel, wocheUm, wochenName, wochenTitel, zaehleWoche } from "@/lib/review";
import type { ReviewDay, ReviewEntry } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Wochenrückblick" };

/** Wie weit sich zurueckblaettern laesst – der Verlauf haelt ohnehin nur 200 je Projekt. */
const MAX_RUECKBLICK = 25;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ woche?: string }>;
}) {
  const user = await requireUserPage();
  const params = await searchParams;

  // Nur nach hinten blaettern: die Zukunft ist im Rueckblick leer.
  const gewuenscht = Number(params.woche ?? 0);
  const versatz = Number.isFinite(gewuenscht)
    ? Math.min(0, Math.max(-MAX_RUECKBLICK, Math.trunc(gewuenscht)))
    : 0;

  const woche = wocheUm(new Date(), versatz);

  /**
   * Der Verlauf kennt keinen Besitzer – die Trennung laeuft ueber das
   * Projekt. Die Bedingung steht deshalb als erste in der where-Klausel.
   */
  const activities = await prisma.activity.findMany({
    where: {
      project: { ownerId: user.id },
      createdAt: { gte: woche.von, lt: woche.bis },
    },
    include: {
      project: { select: { id: true, name: true, accent: true } },
      user: { select: { username: true, displayName: true } },
    },
    // meta kommt mit, weil die Kennzahlen daran ablesen, was erledigt
    // wurde – verlaesslicher als der Anzeigetext.
    orderBy: { createdAt: "desc" },
    // Deckel gegen eine Woche, in der ein Abgleich Amok gelaufen ist.
    take: 500,
  });

  /**
   * Nach Kalendertagen buendeln – auf dem Server, damit Server-Render und
   * Hydration nicht auseinanderlaufen. "Welcher Tag" haengt an der Zeitzone.
   */
  const nachTag = new Map<string, ReviewEntry[]>();
  for (const eintrag of activities) {
    const schluessel = tagesschluessel(eintrag.createdAt);
    const liste = nachTag.get(schluessel) ?? [];
    liste.push({
      id: eintrag.id,
      kind: eintrag.kind,
      summary: eintrag.summary,
      createdAt: eintrag.createdAt.toISOString(),
      project: eintrag.project,
      user: eintrag.user,
    });
    nachTag.set(schluessel, liste);
  }

  // Neuester Tag zuerst, und nur Tage, an denen etwas war.
  const tage: ReviewDay[] = [...woche.tage]
    .reverse()
    .map((tag) => ({ tag, eintraege: nachTag.get(tag) ?? [] }))
    .filter((eintrag) => eintrag.eintraege.length > 0);

  const kennzahlen = zaehleWoche(activities);

  return (
    <div className="space-y-5">
      <header className="fade-up pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-300/70">
          Über alle Projekte
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {wochenName(woche)}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
              <CalendarRange className="h-3.5 w-3.5" />
              {wochenTitel(woche)}
            </p>
          </div>

          <nav className="flex items-center gap-2" aria-label="Woche wählen">
            <Link
              href={`/rueckblick?woche=${versatz - 1}`}
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              aria-label="Eine Woche zurück"
              // Am Ende des Zeitraums bleibt der Verweis stehen, wird aber
              // wirkungslos – die Seite klemmt den Wert ohnehin.
              aria-disabled={versatz <= -MAX_RUECKBLICK}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Früher
            </Link>
            {versatz < 0 ? (
              <Link
                href={`/rueckblick?woche=${versatz + 1}`}
                className="btn btn-ghost px-2.5 py-1.5 text-xs"
                aria-label="Eine Woche vor"
              >
                Später
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {versatz !== 0 ? (
              <Link href="/rueckblick" className="btn btn-ghost px-2.5 py-1.5 text-xs">
                Diese Woche
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <WeeklyReview
        tage={tage}
        kennzahlen={kennzahlen}
        istDieseWoche={versatz === 0}
      />
    </div>
  );
}
