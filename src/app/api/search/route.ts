import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Hit {
  projectId: string;
  noteId: string;
  title: string | null;
  /** Textausschnitt mit hervorgehobener Fundstelle. */
  snippet: string;
}

/**
 * Volltextsuche ueber Notizen.
 *
 * Die Suche im Board arbeitet auf den bereits geladenen Projekten und deckt
 * Name, Kurzbeschreibung und Tags ab. Notizen liegen dort nicht vor – die
 * mitzuladen wuerde die Seite unnoetig aufblaehen. Deshalb dieser Endpunkt:
 * Postgres sucht mit seiner deutschen Textsuche direkt in der Datenbank.
 *
 * ts_headline liefert gleich den passenden Ausschnitt mit; die Hervorhebung
 * kommt als [[…]] zurueck, damit die Oberflaeche kein HTML einbetten muss.
 */
export async function GET(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ query, hits: [], projectIds: [] });
  }

  // websearch_to_tsquery versteht Eingaben wie "docker -compose" oder
  // Anfuehrungszeichen und wirft bei Unsinn keinen Fehler.
  const hits = await prisma.$queryRaw<Hit[]>`
    SELECT
      n."projectId" AS "projectId",
      n."id"        AS "noteId",
      n."title"     AS "title",
      ts_headline(
        'german',
        n."content",
        websearch_to_tsquery('german', ${query}),
        'StartSel=[[, StopSel=]], MaxWords=18, MinWords=6, ShortWord=2, MaxFragments=1'
      ) AS "snippet"
    FROM "Note" n
    JOIN "Project" p ON p."id" = n."projectId"
    WHERE p."ownerId" = ${auth.user.id}
      AND to_tsvector('german', coalesce(n."title", '') || ' ' || n."content")
          @@ websearch_to_tsquery('german', ${query})
    ORDER BY ts_rank(
      to_tsvector('german', coalesce(n."title", '') || ' ' || n."content"),
      websearch_to_tsquery('german', ${query})
    ) DESC
    LIMIT 50
  `;

  return NextResponse.json({
    query,
    hits,
    // Die Oberflaeche braucht vor allem die betroffenen Projekte, um sie im
    // Board einzublenden.
    projectIds: Array.from(new Set(hits.map((hit) => hit.projectId))),
  });
}
