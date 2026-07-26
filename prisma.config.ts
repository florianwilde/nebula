import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Konfiguration der Prisma-CLI.
 *
 * Loest den Abschnitt `prisma` in der package.json ab, der mit Prisma 7
 * wegfaellt.
 *
 * **Der Aufruf von dotenv ist nicht optional.** Sobald diese Datei
 * existiert, liest Prisma die .env nicht mehr von selbst ein – ohne die
 * folgenden Zeilen stuende `migrate deploy` plotzlich ohne DATABASE_URL da,
 * und zwar mit einer Fehlermeldung, die nicht darauf hindeutet. Erst .env,
 * dann .env.local: eine oertliche Abweichung soll gewinnen.
 */
loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
