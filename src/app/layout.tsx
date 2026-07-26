import type { Metadata, Viewport } from "next";
import { ChangelogButton } from "@/components/ChangelogButton";
import { CommandPalette } from "@/components/CommandPalette";
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
    manifest: "/manifest.webmanifest",
    // iOS liest das Manifest nicht; dort braucht es diese Angaben einzeln.
    appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
    // Beide Eintraege ausdruecklich: sobald hier etwas steht, ersetzt es den
    // Verweis, den Next aus app/icon.svg von selbst erzeugt. Ohne die erste
    // Zeile haette die Seite gar kein Symbol mehr und der Browser fiele auf
    // /favicon.ico zurueck – das es hier nicht gibt.
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
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

        {/* Nur fuer Angemeldete – auf der Anmeldeseite gibt es nichts zu suchen. */}
        {user ? <CommandPalette isAdmin={user.role === "ADMIN"} /> : null}

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-6">
            <span>{APP_NAME} · lokal betrieben, Daten bleiben in deiner PostgreSQL.</span>
            <ChangelogButton version={APP_VERSION} />
          </div>
        </footer>
      </body>
    </html>
  );
}
