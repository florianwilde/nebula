import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SetupForm } from "@/components/auth/SetupForm";
import { getInstanceState } from "@/lib/auth/settings";
import { APP_NAME } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Einrichtung" };
}

export default async function SetupPage() {
  const state = await getInstanceState();

  // Nach der Einrichtung ist diese Seite verschlossen.
  if (!state.needsSetup) redirect("/login");

  // Bestandsdaten anzeigen, damit klar ist, was das neue Konto uebernimmt.
  const [orphanProjects, orphanConnections] = await Promise.all([
    prisma.project.count({ where: { ownerId: null } }),
    prisma.gitConnection.count({ where: { ownerId: null } }),
  ]);

  return (
    <AuthShell
      appName={APP_NAME}
      title="Erste Einrichtung"
      subtitle="Lege das Administratorkonto an. Danach ist diese Seite gesperrt."
      footer={
        orphanProjects + orphanConnections > 0 ? (
          <>
            {orphanProjects} vorhandene Projekte und {orphanConnections} Git-Verbindungen
            werden diesem Konto zugeordnet.
          </>
        ) : null
      }
    >
      <SetupForm />
    </AuthShell>
  );
}
