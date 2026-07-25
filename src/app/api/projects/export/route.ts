import { requireUserApi } from "@/lib/auth/guard";
import { APP_NAME } from "@/lib/config";
import { exportFileName } from "@/lib/export/format";
import { buildExportFile, loadProjectsForExport } from "@/lib/export/project";
import { jsonError } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/** Alle eigenen Projekte als JSON zum Herunterladen. */
export async function GET() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const projects = await loadProjectsForExport(auth.user.id);
  if (projects.length === 0) {
    return jsonError("Es gibt noch keine Projekte zum Exportieren.", 404);
  }

  const payload = buildExportFile(projects);
  const filename = exportFileName(`${APP_NAME}-projekte`, new Date(), "json");

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
