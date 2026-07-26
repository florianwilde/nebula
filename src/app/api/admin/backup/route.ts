import { requireAdminApi } from "@/lib/auth/guard";
import { APP_NAME } from "@/lib/config";
import { prisma } from "@/lib/db";
import { exportFileName } from "@/lib/export/format";

export const dynamic = "force-dynamic";

/**
 * Vollstaendige Sicherung der Instanz als JSON.
 *
 * Anders als der Projekt-Export ist das eine echte Sicherung und enthaelt
 * deshalb auch Konten und Verbindungen. Was drinsteht:
 *
 *  - Passwoerter nur als scrypt-Hash, nicht im Klartext
 *  - Git-Tokens nur als Chiffrat; ohne dasselbe APP_SECRET sind sie wertlos
 *  - Sitzungen und Passkeys bewusst nicht: Sitzungen sind kurzlebig, und
 *    Passkeys haengen ohnehin am Geraet und an der rpID
 *
 * Die Datei ist damit vertraulich zu behandeln. Fuer eine byteweise Sicherung
 * der Datenbank siehe scripts/backup.* mit pg_dump.
 */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const [settings, users, connections, projects] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { username: "asc" },
    }),
    prisma.gitConnection.findMany({
      select: {
        id: true,
        ownerId: true,
        name: true,
        provider: true,
        baseUrl: true,
        username: true,
        tokenCipher: true,
        tokenHint: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      include: {
        notes: { orderBy: { createdAt: "asc" } },
        tasks: { orderBy: [{ status: "asc" }, { position: "asc" }] },
        // Snapshots bleiben draussen: reproduzierbar und gross.
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const payload = {
    kind: "nebula.backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    app: APP_NAME,
    note:
      "Enthaelt Passwort-Hashes und verschluesselte Git-Tokens. " +
      "Die Tokens sind nur mit demselben APP_SECRET wieder lesbar. Vertraulich behandeln.",
    settings,
    users,
    connections,
    projects,
  };

  const filename = exportFileName(`${APP_NAME}-sicherung`, new Date(), "json");

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
