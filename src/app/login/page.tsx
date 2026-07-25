import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/auth/session";
import { getInstanceState } from "@/lib/auth/settings";
import { APP_NAME, WEBAUTHN_AVAILABLE } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Anmelden" };
}

type PageProps = { searchParams: Promise<{ weiter?: string }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const [user, state, params] = await Promise.all([
    getSessionUser(),
    getInstanceState(),
    searchParams,
  ]);

  if (state.needsSetup) redirect("/setup");
  if (user) redirect("/");

  // Nur relative Pfade zulassen – sonst waere das ein offener Redirect.
  const raw = params.weiter ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <AuthShell
      appName={APP_NAME}
      title="Willkommen zurueck"
      subtitle="Melde dich an, um deine Projekte zu sehen."
    >
      <LoginForm
        passkeysAvailable={WEBAUTHN_AVAILABLE}
        registrationOpen={state.registrationOpen}
        next={next}
      />
    </AuthShell>
  );
}
