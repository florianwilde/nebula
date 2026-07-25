import type { Metadata, Viewport } from "next";
import { TopNav } from "@/components/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nebula – Vibe Coding Dashboard",
    template: "%s · Nebula",
  },
  description:
    "Uebersicht ueber alle Vibe-Coding Projekte: Status, Notizen und Live-Daten aus GitHub, GitLab und Gitea.",
  applicationName: "Nebula",
};

export const viewport: Viewport = {
  themeColor: "#05060f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <div className="aurora" aria-hidden="true">
          <div className="aurora-blob aurora-blob--one" />
          <div className="aurora-blob aurora-blob--two" />
          <div className="aurora-blob aurora-blob--three" />
        </div>
        <div className="aurora-grid" aria-hidden="true" />

        <TopNav />

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-6">
            <span>
              Nebula · lokal betrieben, Daten bleiben in deiner PostgreSQL.
            </span>
            <span className="font-mono text-slate-600">v0.1.0</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
