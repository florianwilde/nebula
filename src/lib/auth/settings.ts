import type { AppSettings } from "@prisma/client";
import { APP_NAME } from "@/lib/config";
import { prisma } from "@/lib/db";

/**
 * Einstellungen der Instanz. Es gibt genau eine Zeile mit der id "singleton";
 * sie wird beim ersten Zugriff angelegt.
 */
export async function getAppSettings(): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", rpName: APP_NAME },
    update: {},
  });
}

export interface InstanceState {
  settings: AppSettings;
  userCount: number;
  /** Kein Konto vorhanden – die Einrichtung steht noch aus. */
  needsSetup: boolean;
  /** Darf sich jemand selbst registrieren? */
  registrationOpen: boolean;
  multiUser: boolean;
}

export async function getInstanceState(): Promise<InstanceState> {
  const [settings, userCount] = await Promise.all([
    getAppSettings(),
    prisma.user.count(),
  ]);

  const multiUser = settings.mode === "MULTI_USER";

  return {
    settings,
    userCount,
    needsSetup: userCount === 0,
    // Im Einzelbetrieb gibt es grundsaetzlich keine Selbstregistrierung.
    registrationOpen: multiUser && settings.allowRegistration,
    multiUser,
  };
}
