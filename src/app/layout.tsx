import type { Metadata, Viewport } from "next";
import { TopNav } from "@/components/TopNav";
import { getSessionUser } from "@/lib/auth/session";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/lib/config";
import "./globals.css";

/**
 * generateMetadata statt eines konstanten metadata-Objekts: nur so wird
 * APP_NAME zur Laufzeit gelesen. Ein konstanter Export waere beim Build
 * eingefroren und liesse sich im fertigen Docker-Image nicht mehr aendern.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: `${APP_NAME} – Vibe Coding Dashboard`,
      template: `%s · ${APP_NAME}`,
    },
    description:
      "Uebersicht ueber alle Vibe-Coding Projekte: Status, Notizen und Live-Daten aus GitHub, GitLab und Gitea.",
    applicationName: APP_NAME,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#05060f",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="de" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <div className="aurora" aria-hidden="true">
          <div className="aurora-blob aurora-blob--one" />
          <div className="aurora-blob aurora-blob--two" />
          <div className="aurora-blob aurora-blob--three" />
        </div>
        <div className="aurora-grid" aria-hidden="true" />

        <TopNav user={user} appName={APP_NAME} tagline={APP_TAGLINE} />

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-6">
            <span>{APP_NAME} · lokal betrieben, Daten bleiben in deiner PostgreSQL.</span>
            <span className="font-mono text-slate-600">v{APP_VERSION}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
