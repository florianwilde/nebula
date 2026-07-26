import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Bereitet die Testdatenbank vor: Schema einspielen und leeren.
 *
 * Die Datenbank muss vorher existieren. Anlegen ist bewusst nicht Teil des
 * Setups – in CI erzeugt sie der Postgres-Dienst, oertlich einmalig:
 *
 *   docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_e2e_test"
 */

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://nebula:nebula@localhost:5432/nebula_e2e_test?schema=public";

/**
 * Reihenfolge egal, weil CASCADE – aber vollstaendig muss sie sein, sonst
 * schleppen Laeufe Reste mit.
 */
const TABLES = [
  "Task",
  "Note",
  "RepoSnapshot",
  "Project",
  "Credential",
  "Session",
  "WebAuthnChallenge",
  "GitConnection",
  "User",
  "AppSettings",
];

export default async function globalSetup() {
  const name = new URL(DATABASE_URL).pathname.replace(/^\//, "");

  // Schutz vor dem teuersten aller Fehler: eine Testreihe, die die echte
  // Datenbank leert. Der Name muss "test" enthalten, sonst passiert nichts.
  if (!name.includes("test")) {
    throw new Error(
      `Die Testdatenbank heisst "${name}" und enthaelt nicht "test". ` +
        "Aus Sicherheitsgruenden abgebrochen – E2E_DATABASE_URL pruefen.",
    );
  }

  console.log(`[e2e] Datenbank: ${name}`);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL },
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    const list = TABLES.map((table) => `"${table}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log("[e2e] Datenbank geleert.");
  } finally {
    await prisma.$disconnect();
  }
}
