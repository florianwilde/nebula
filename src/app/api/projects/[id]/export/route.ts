import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { exportFileName } from "@/lib/export/format";
import { buildExportFile, toMarkdown } from "@/lib/export/project";
import { jsonError } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Ein einzelnes Projekt exportieren.
 *
 *   ?format=json  (Vorgabe)  – zum Wiedereinlesen
 *   ?format=md               – lesbar, zum Archivieren
 */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "json";

  const project = await prisma.project.findFirst({
    where: { id, ownerId: auth.user.id },
    include: {
      notes: { orderBy: [{ pinned: "desc" }, { createdAt: "asc" }] },
      tasks: { orderBy: [{ status: "asc" }, { position: "asc" }] },
      connection: { select: { name: true, provider: true, baseUrl: true } },
      snapshot: true,
    },
  });

  if (!project) return jsonError("Projekt nicht gefunden", 404);

  if (format === "md" || format === "markdown") {
    const filename = exportFileName(project.slug, new Date(), "md");
    return new Response(toMarkdown(project), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const payload = buildExportFile([project]);
  const filename = exportFileName(project.slug, new Date(), "json");

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
