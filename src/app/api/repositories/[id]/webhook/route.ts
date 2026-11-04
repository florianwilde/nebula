import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { APP_URL } from "@/lib/config";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { GitApiError, clientForConnection } from "@/lib/git";
import { jsonError } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Repository samt Verbindung – nur, wenn es dem Benutzer gehoert. */
function ownedWithConnection(repositoryId: string, ownerId: string) {
  return prisma.repository.findFirst({
    where: { project: { ownerId }, id: repositoryId },
    include: { connection: true },
  });
}

type Repo = NonNullable<Awaited<ReturnType<typeof ownedWithConnection>>>;

/** Ein Client fuer das Repository, sofern es einen Token und Owner/Name hat. */
function clientFor(repository: Repo) {
  if (!repository.connection || !repository.repoOwner || !repository.repoName) return null;
  return {
    client: clientForConnection(repository.connection),
    ref: { owner: repository.repoOwner, name: repository.repoName },
  };
}

/**
 * Richtet den Webhook eines Repositories ein oder erneuert sein Geheimnis.
 *
 * Das Geheimnis wird hier erzeugt und liegt danach nur noch verschluesselt
 * in der Datenbank, wie die Zugangstoken.
 *
 * **Eintragen im Git-System versucht Nebula selbst**, mit dem Token der
 * Verbindung. Dafuer braucht der Token ein Recht mehr als fuer den Abgleich
 * (bei GitHub "Webhooks: Read and write", das keine Administration des
 * Repositories umfasst). Fehlt es, antwortet das Git-System mit 403 oder
 * 404 – dann geht das Geheimnis einmal im Klartext zurueck, und der Haken
 * wird wie bisher von Hand eingetragen. Wer dem Token das Recht nicht geben
 * will, verliert also nichts.
 *
 * Einen frueher selbst eingetragenen Haken entfernt Nebula vorher, sonst
 * saessen nach jedem Erneuern zwei im Git-System, einer davon mit einem
 * Geheimnis, das nicht mehr gilt.
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const repository = await ownedWithConnection(id, auth.user.id);
  if (!repository) return jsonError("Repository nicht gefunden", 404);

  // 32 Byte, hexadezimal. Lang genug, dass Raten aussichtslos ist, und
  // ohne Sonderzeichen, die in Formularfeldern Aerger machen.
  const secret = randomBytes(32).toString("hex");
  const url = `${APP_URL}/api/webhooks/${repository.id}`;

  await prisma.repository.update({
    where: { id: repository.id },
    data: { webhookSecret: encryptSecret(secret), webhookLastAt: null },
  });

  const zugang = clientFor(repository);
  if (!zugang) {
    return NextResponse.json({
      secret,
      url,
      registered: false,
      registerError:
        "Ohne Git-Verbindung kann Nebula den Haken nicht selbst eintragen – bitte wie unten " +
        "beschrieben von Hand.",
    });
  }

  if (repository.webhookRemoteId) {
    // Fehlt er schon, ist das Ziel ohnehin erreicht.
    await zugang.client.deleteWebhook(zugang.ref, repository.webhookRemoteId).catch(() => undefined);
  }

  try {
    const hook = await zugang.client.createWebhook(zugang.ref, { url, secret });
    await prisma.repository.update({
      where: { id: repository.id },
      data: { webhookRemoteId: hook.id },
    });
    // Das Geheimnis geht nicht zurueck: es steht schon im Git-System, und
    // was nirgends angezeigt wird, kann auch nicht abgeschrieben werden.
    return NextResponse.json({ url, registered: true });
  } catch (error) {
    await prisma.repository.update({
      where: { id: repository.id },
      data: { webhookRemoteId: null },
    });
    return NextResponse.json({
      secret,
      url,
      registered: false,
      registerError:
        (error instanceof GitApiError
          ? `Nicht selbst eingetragen: ${error.message}`
          : "Nicht selbst eingetragen.") +
        " Mit dem Recht, Webhooks zu verwalten, traegt Nebula ihn beim naechsten Mal selbst " +
        "ein – sonst wie unten beschrieben von Hand.",
    });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const repository = await ownedWithConnection(id, auth.user.id);
  if (!repository) return jsonError("Repository nicht gefunden", 404);

  // Den selbst eingetragenen Haken mitnehmen. Gelingt das nicht, gilt das
  // Geheimnis trotzdem nicht mehr – eingehende Aufrufe werden abgewiesen.
  let remoteRemoved: boolean | null = null;
  const zugang = clientFor(repository);
  if (repository.webhookRemoteId && zugang) {
    remoteRemoved = await zugang.client
      .deleteWebhook(zugang.ref, repository.webhookRemoteId)
      .then(() => true)
      .catch(() => false);
  }

  await prisma.repository.update({
    where: { id: repository.id },
    data: { webhookSecret: null, webhookLastAt: null, webhookRemoteId: null },
  });

  return NextResponse.json({ ok: true, remoteRemoved });
}
