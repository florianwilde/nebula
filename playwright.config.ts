import { defineConfig } from "@playwright/test";

/**
 * Ende-zu-Ende-Tests gegen die echte Anwendung.
 *
 * Playwright startet den Produktionsserver selbst und richtet ihn auf eine
 * eigene Datenbank. Der Port ist bewusst ein anderer als 3000 und 3100,
 * damit eine laufende Instanz nicht stoert.
 *
 * Voraussetzung: ein Bau (`npm run build`) und eine leere Datenbank, deren
 * Name "test" enthaelt – siehe global-setup.ts. Beides erledigt
 * `npm run test:e2e`.
 */

const PORT = Number(process.env.E2E_PORT ?? 3111);
const BASE_URL = `http://localhost:${PORT}`;

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://nebula:nebula@localhost:5432/nebula_e2e_test?schema=public";

export default defineConfig({
  testDir: "./e2e",
  // Die Tests teilen sich eine Datenbank, deshalb nacheinander.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Oertlich der installierte Chrome, damit kein Browser geladen werden
    // muss. In CI gibt es keinen – dort das mitgelieferte Chromium
    // (siehe "playwright install chromium" im Arbeitsablauf).
    ...(process.env.CI ? {} : { channel: "chrome" as const }),
  },

  webServer: {
    command: "npm start",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL,
      PORT: String(PORT),
      APP_URL: BASE_URL,
      NODE_ENV: "production",
      // Fester Schluessel, damit Laeufe vergleichbar bleiben.
      APP_SECRET: "e2e-test-secret-nur-fuer-die-testlaeufe-1234567890",
    },
  },
});
