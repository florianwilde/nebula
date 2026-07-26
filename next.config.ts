import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" erzeugt einen self-contained Server unter .next/standalone.
  // Das Docker-Image nutzt genau diesen Output; im Standalone-Betrieb ohne
  // Docker stoert die Option nicht ("npm start" laeuft weiterhin ueber next start).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma darf nicht gebundlet werden, sonst findet der Client seine Engine nicht.
  serverExternalPackages: ["@prisma/client", "prisma"],
  images: {
    /**
     * Der Bildoptimierer ist abgeschaltet.
     *
     * Nebula benutzt next/image nirgends – die paar Symbole sind SVG und
     * PNG in fester Groesse. Der Endpunkt /_next/image waere aber trotzdem
     * da, und zwar ohne Anmeldung: die Middleware nimmt ihn aus, weil dort
     * sonst nur Rechenzeit verbraucht wuerde.
     *
     * Er reicht jedes Bild durch sharp und damit durch libvips, fuer das es
     * regelmaessig Schwachstellen gibt (aktuell CVE-2026-33327 und drei
     * weitere). Eine Angriffsflaeche ohne Gegenwert – also weg damit.
     */
    unoptimized: true,
  },
};

export default nextConfig;
