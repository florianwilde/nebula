import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" erzeugt einen self-contained Server unter .next/standalone.
  // Das Docker-Image nutzt genau diesen Output; im Standalone-Betrieb ohne
  // Docker stoert die Option nicht ("npm start" laeuft weiterhin ueber next start).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Prisma darf nicht gebundlet werden, sonst findet der Client seine Engine nicht.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
