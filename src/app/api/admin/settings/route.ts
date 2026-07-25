import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guard";
import { getAppSettings } from "@/lib/auth/settings";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { adminSettingsSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const [settings, userCount] = await Promise.all([getAppSettings(), prisma.user.count()]);
  return NextResponse.json({ settings, userCount });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = adminSettingsSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const {
    mode,
    allowRegistration,
    autoSyncEnabled,
    autoSyncIntervalMinutes,
    autoSyncActiveOnly,
    autoSyncBatchSize,
  } = parsed.data;

  // Der Wechsel in den Einzelbetrieb wuerde weitere Konten aussperren –
  // deshalb nur erlauben, wenn es wirklich nur ein Konto gibt.
  if (mode === "SINGLE_USER") {
    const userCount = await prisma.user.count();
    if (userCount > 1) {
      return jsonError(
        `Einzelbetrieb ist nicht moeglich, solange ${userCount} Konten existieren. ` +
          "Bitte zuerst die uebrigen Konten entfernen.",
        409,
      );
    }
  }

  const autoSyncFields = {
    ...(autoSyncEnabled !== undefined ? { autoSyncEnabled } : {}),
    ...(autoSyncIntervalMinutes !== undefined ? { autoSyncIntervalMinutes } : {}),
    ...(autoSyncActiveOnly !== undefined ? { autoSyncActiveOnly } : {}),
    ...(autoSyncBatchSize !== undefined ? { autoSyncBatchSize } : {}),
  };

  const settings = await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      ...(mode ? { mode } : {}),
      ...(allowRegistration !== undefined ? { allowRegistration } : {}),
      ...autoSyncFields,
    },
    update: {
      ...(mode ? { mode } : {}),
      ...(allowRegistration !== undefined ? { allowRegistration } : {}),
      // Im Einzelbetrieb ergibt eine offene Registrierung keinen Sinn.
      ...(mode === "SINGLE_USER" ? { allowRegistration: false } : {}),
      ...autoSyncFields,
    },
  });

  return NextResponse.json({ settings });
}
