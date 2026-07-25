import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getSessionUser } from "@/lib/auth/session";
import { getInstanceState } from "@/lib/auth/settings";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Registrieren" };
}

export default async function RegisterPage() {
  const [user, state] = await Promise.all([getSessionUser(), getInstanceState()]);

  if (state.needsSetup) redirect("/setup");
  if (user) redirect("/");
  if (!state.registrationOpen) redirect("/login");

  return (
    <AuthShell
      appName={APP_NAME}
      title="Konto anlegen"
      subtitle="Deine Projekte, Notizen und Git-Verbindungen sind nur fuer dich sichtbar."
    >
      <RegisterForm />
    </AuthShell>
  );
}
