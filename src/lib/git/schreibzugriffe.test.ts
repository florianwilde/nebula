import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Waechter ueber eine Zusage in der Dokumentation.
 *
 * README und FEATURES zaehlen auf, wo Nebula nach draussen schreibt: ein
 * Issue anlegen, seinen Zustand umsetzen und – nur wenn der Token es darf –
 * den Webhook eintragen und wieder entfernen. Auf dieser Aufzaehlung steht
 * die Empfehlung, ein rein lesendes Token zu vergeben, solange die
 * Issue-Anbindung nicht gebraucht wird.
 *
 * Kaeme ein weiterer Schreibaufruf dazu, wuerde die Empfehlung still falsch:
 * niemand bekaeme einen Fehler, nur ein 403 an einer Stelle, die laut
 * Dokumentation gar nicht schreibt. Deshalb wird hier der Quelltext selbst
 * abgeklopft – sendJson ist der einzige Weg aus lib/git heraus, der eine
 * andere Methode als GET benutzt (siehe http.ts).
 */
const CLIENTS = ["gitea.ts", "github.ts", "gitlab.ts"] as const;

/** Die Zeile ueber dem Methoden-Argument nennt den Endpunkt. */
function schreibaufrufe(quelltext: string): string[] {
  const zeilen = quelltext.split("\n");
  const gefunden: string[] = [];
  zeilen.forEach((zeile, i) => {
    if (!/\bsendJson[<(]/.test(zeile)) return;
    // sendJson(url, METHODE, …) – Endpunkt und Methode stehen darunter.
    const block = zeilen.slice(i, i + 4).join(" ");
    const methode = block.match(/"(POST|PATCH|PUT|DELETE)"/)?.[1];
    const pfad = block.match(/\/(issues|hooks)[^`"']*/)?.[0] ?? "?";
    gefunden.push(`${methode ?? "?"} ${pfad}`);
  });
  return gefunden;
}

describe("Schreibzugriffe nach draussen", () => {
  it("beschraenken sich auf Issues und den eigenen Webhook", () => {
    for (const datei of CLIENTS) {
      const quelltext = readFileSync(join(__dirname, datei), "utf8");
      const aufrufe = schreibaufrufe(quelltext);

      expect(aufrufe.length, `${datei}: Anzahl Schreibaufrufe`).toBe(4);
      for (const aufruf of aufrufe) {
        expect(aufruf, `${datei}: ${aufruf}`).toMatch(
          /^((POST|PATCH|PUT) \/issues|(POST|DELETE) \/hooks)/,
        );
      }
      // Issues: genau einer legt an, genau einer setzt um.
      expect(aufrufe.filter((a) => a.startsWith("POST /issues")).length, datei).toBe(1);
      expect(aufrufe.filter((a) => /^(PATCH|PUT) \/issues/.test(a)).length, datei).toBe(1);
      // Webhook: genau einer traegt ein, genau einer entfernt.
      expect(aufrufe.filter((a) => a.startsWith("POST /hooks")).length, datei).toBe(1);
      expect(aufrufe.filter((a) => a.startsWith("DELETE /hooks")).length, datei).toBe(1);
    }
  });

  it("laufen ueber sendJson, nicht an http.ts vorbei", () => {
    // Ein direkter fetch in einem Client haette weder SSRF-Schutz noch
    // Zeitbegrenzung – und wuerde am Waechter oben vorbeilaufen.
    for (const datei of CLIENTS) {
      const quelltext = readFileSync(join(__dirname, datei), "utf8");
      expect(quelltext, datei).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
