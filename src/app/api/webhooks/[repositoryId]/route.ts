import { NextResponse } from "next/server";
import { tryDecryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/security/rateLimit";
import { syncRepository } from "@/lib/sync";
import { completeTaskFromIssue, statusForIssueState } from "@/lib/tasks/issues";
import { refreshDerivedProgress } from "@/lib/tasks";
import { parseEvent, verifySignature } from "@/lib/webhooks/verify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ repositoryId: string }> };

/** Groesse des Rumpfes deckeln – ein Push-Ereignis ist nie ein Megabyte. */
const MAX_BODY = 512 * 1024;

/**
 * Eingehende Webhooks von GitHub, GitLab und Gitea.
 *
 * Der einzige Endpunkt ohne Anmeldung, der etwas schreibt. Ausgewiesen wird
 * sich mit einer Signatur ueber den Rumpf, geprueft gegen das Geheimnis, das
 * beim Einrichten am Repository hinterlegt wurde.
 *
 * Absichtlich sparsam in dem, was er tut:
 *
 *   push    – stoesst denselben Abgleich an wie der Zeitgeber
 *   issues  – geschlossen oder wieder geoeffnet wandert an die Aufgabe;
 *             ein neues Issue stoesst den Abgleich an, wenn das Projekt
 *             neue Issues von selbst uebernimmt
 *
 * Alles andere wird angenommen und liegen gelassen. Ein Webhook, der mit
 * einem Fehler antwortet, wird von den Systemen wiederholt und irgendwann
 * abgeschaltet – deshalb ist "verstanden, nichts zu tun" die richtige
 * Antwort auf ein unbekanntes Ereignis.
 *
 * Was hier NICHT passiert: der Rumpf wird nie als Quelle fuer Inhalte
 * benutzt. Titel, Beschreibung und Zustand einer Aufgabe kommen weiter aus
 * Nebula beziehungsweise beim naechsten Abgleich aus der API. Wer das
 * Geheimnis kennt, kann also hoechstens eine Aufgabe auf- oder zumachen und
 * einen Abgleich ausloesen – nicht beliebige Daten einschleusen.
 */
export async function POST(request: Request, { params }: Params) {
  const { repositoryId } = await params;

  // Die ID steht in der URL und ist damit halboeffentlich. Ein Deckel
  // dagegen, sie als Orakel zu benutzen oder den Abgleich zu verheizen.
  const limit = rateLimit(`webhook:${repositoryId}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Zu viele Aufrufe." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { connection: true, project: { select: { autoImportIssues: true } } },
  });

  // Unbekanntes Repository und fehlendes Geheimnis sind dieselbe Antwort:
  // ob es die ID gibt, geht den Anrufer nichts an.
  const secret = repository?.webhookSecret
    ? tryDecryptSecret(repository.webhookSecret)
    : null;
  if (!repository || !secret) {
    return NextResponse.json({ error: "Unbekannt." }, { status: 404 });
  }

  const roh = await request.text();
  if (roh.length > MAX_BODY) {
    return NextResponse.json({ error: "Rumpf zu gross." }, { status: 413 });
  }

  /**
   * Der **rohe** Rumpf geht in die Pruefung, nicht das geparste Objekt:
   * durch JSON.parse und JSON.stringify gedreht kaeme eine andere Zeichen-
   * folge heraus und die Signatur passte nie.
   */
  const provider = repository.connection?.provider ?? "GITEA";
  const geprueft = verifySignature(provider, secret, roh, request.headers);
  if (!geprueft.ok) {
    return NextResponse.json({ error: "Signatur ungueltig." }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(roh);
  } catch {
    return NextResponse.json({ error: "Kein gueltiges JSON." }, { status: 400 });
  }

  const eventName =
    request.headers.get("x-github-event") ??
    request.headers.get("x-gitea-event") ??
    request.headers.get("x-gitlab-event");

  const ereignis = parseEvent(provider, eventName, payload);

  // Ab hier gilt der Aufruf als echt – das ist die Rueckmeldung darueber,
  // ob der Haken im Git-System ueberhaupt funktioniert.
  await prisma.repository.update({
    where: { id: repository.id },
    data: { webhookLastAt: new Date() },
  });

  if (ereignis.kind === "push") {
    // Derselbe Weg wie beim Zeitgeber – nur eben sofort statt beim
    // naechsten Durchlauf.
    await syncRepository(repository.id).catch(() => undefined);
    return NextResponse.json({ ok: true, handled: "push" });
  }

  if (ereignis.kind === "issue") {
    const task = await prisma.task.findFirst({
      where: { sourceRepositoryId: repository.id, sourceIssue: ereignis.number },
      select: { id: true, status: true, projectId: true },
    });
    if (!task) {
      /**
       * Ein Issue ohne Aufgabe – meist ein neues. Will das Projekt neue
       * Issues uebernehmen, laeuft der Abgleich: der holt Titel und Labels
       * aus der API und legt die Aufgabe an. Aus dem Rumpf wird auch hier
       * nichts uebernommen, der Webhook ist nur der Anstoss.
       */
      if (ereignis.open && repository.project.autoImportIssues) {
        await syncRepository(repository.id).catch(() => undefined);
        return NextResponse.json({ ok: true, handled: "issue", matched: false, synced: true });
      }
      return NextResponse.json({ ok: true, handled: "issue", matched: false });
    }

    const ziel = statusForIssueState(ereignis.open, task.status);

    if (ziel === "DONE" && task.status !== "DONE") {
      // Ueber die gemeinsame Funktion, damit ein geschlossenes Issue
      // dasselbe bewirkt wie ein Haken in der Oberflaeche: naechste Fassung
      // einer wiederkehrenden Aufgabe und ein Eintrag im Verlauf.
      await completeTaskFromIssue(task.id, "webhook");
    } else if (ziel !== task.status) {
      // Wieder geoeffnet. Das darf nur der Webhook, weil hier ein echtes
      // "reopened" vorliegt – der Abgleich sieht nur Zustaende und wuerde
      // sonst eine bewusst erledigte Aufgabe aufmachen.
      await prisma.task.update({
        where: { id: task.id },
        data: { status: ziel, doneAt: null },
      });
      await refreshDerivedProgress(task.projectId);
    }

    return NextResponse.json({ ok: true, handled: "issue", matched: true, status: ziel });
  }

  return NextResponse.json({ ok: true, handled: "ignored", event: ereignis.name });
}
