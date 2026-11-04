#!/usr/bin/env node
// Gibt den Titel fuer das Release einer Version aus: "v1.12.0 — Schlagzeile".
//
// Die Schlagzeile steht schon im Aenderungsverlauf (src/lib/changelog.ts) und
// soll nicht ein zweites Mal von Hand geschrieben werden. Gelesen wird per
// Muster statt per Import, weil die Datei TypeScript ist und der Workflow
// dafuer keinen Uebersetzer braucht.
//
// Aufruf: node scripts/release-title.mjs 1.12.0

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Aufruf: node scripts/release-title.mjs <version>");
  process.exit(2);
}

const quelle = readFileSync(
  fileURLToPath(new URL("../src/lib/changelog.ts", import.meta.url)),
  "utf8",
);

// Der Eintrag beginnt mit version: "x.y.z"; die erste headline danach gehoert
// zu ihm.
const start = quelle.indexOf(`version: "${version}"`);
const treffer = start >= 0 ? quelle.slice(start).match(/headline:\s*"((?:[^"\\]|\\.)*)"/) : null;

if (!treffer) {
  // Ohne Eintrag im Verlauf lieber scheitern: dann passen Tag und Verlauf
  // nicht zusammen, und das soll auffallen.
  console.error(`Kein Eintrag fuer ${version} in src/lib/changelog.ts.`);
  process.exit(1);
}

// Wie bei den bisherigen Releases nur der erste Teil der Schlagzeile: was
// nach dem Gedankenstrich kommt, ist Nachsatz. Der Punkt am Ende gehoert in
// den Satz, nicht in einen Titel.
const schlagzeile = JSON.parse(`"${treffer[1]}"`).split(" — ")[0].replace(/\.$/, "");
console.log(`v${version} — ${schlagzeile}`);
