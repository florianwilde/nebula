#!/usr/bin/env node
/**
 * Nebula – Ersteinrichtung.
 *
 * Legt eine .env auf Basis von .env.example an und erzeugt dabei einen
 * zufaelligen APP_SECRET. Vorhandene .env-Dateien werden nicht angefasst.
 *
 *   node scripts/setup.mjs        bzw.   npm run setup
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

const c = {
  reset: "[0m",
  dim: "[2m",
  green: "[32m",
  yellow: "[33m",
  cyan: "[36m",
};

function log(message) {
  console.log(message);
}

if (!existsSync(examplePath)) {
  console.error(`${c.yellow}.env.example nicht gefunden – abgebrochen.${c.reset}`);
  process.exit(1);
}

if (existsSync(envPath)) {
  log(`${c.yellow}·${c.reset} .env existiert bereits – sie wird nicht ueberschrieben.`);
} else {
  const secret = randomBytes(32).toString("base64");
  const content = readFileSync(examplePath, "utf8").replace(
    /^APP_SECRET=.*$/m,
    `APP_SECRET="${secret}"`,
  );
  writeFileSync(envPath, content, "utf8");
  log(`${c.green}✓${c.reset} .env angelegt (APP_SECRET wurde zufaellig erzeugt).`);
}

log("");
log(`${c.cyan}Naechste Schritte${c.reset}`);
log(`${c.dim}─────────────────────────────────────────────${c.reset}`);
log("Standalone (App lokal, Datenbank im Container):");
log(`  ${c.dim}1.${c.reset} docker compose up -d db`);
log(`  ${c.dim}2.${c.reset} npm install`);
log(`  ${c.dim}3.${c.reset} npm run db:migrate`);
log(`  ${c.dim}4.${c.reset} npm run db:seed        ${c.dim}(optional, Beispieldaten)${c.reset}`);
log(`  ${c.dim}5.${c.reset} npm run dev            ${c.dim}→ http://localhost:3000${c.reset}`);
log("");
log("Alles in Docker:");
log(`  ${c.dim}1.${c.reset} docker compose --profile full up -d --build`);
log(`  ${c.dim}2.${c.reset} ${c.dim}→ http://localhost:3000${c.reset}`);
log("");
log("Eigene, bereits laufende PostgreSQL:");
log(`  DATABASE_URL in der .env anpassen, dann npm run db:migrate`);
log("");
