/**
 * Das README eines Repositories – gemeinsame Teile fuer alle drei Anbieter.
 *
 * Gezeigt wird es auf der Projektseite, damit man nicht ins Git wechseln
 * muss, nur um zu sehen, worum ein halbvergessenes Projekt eigentlich ging.
 */

export interface RepoReadme {
  /** Roher Markdown-Text. */
  content: string;
  /** Dateiname im Repository, etwa "README.md". */
  path: string;
  /**
   * Basis, gegen die relative Links im Text aufzuloesen sind – die
   * Web-Ansicht des Repositories im Verzeichnis des READMEs.
   */
  baseUrl: string | null;
  /** Wurde am Deckel abgeschnitten? */
  truncated: boolean;
}

/**
 * Hoechstlaenge. Ein README von einem Megabyte gibt es, und es waere in
 * einer Vorschau ohnehin unlesbar – abgeschnitten wird an einer
 * Zeilengrenze, damit kein halber Codeblock stehen bleibt.
 */
export const README_MAX_CHARS = 60_000;

/**
 * Dateinamen, die als README gelten – in dieser Reihenfolge. Markdown zuerst,
 * weil nur das dargestellt werden kann; die uebrigen landen als Klartext in
 * einem Codeblock, was immer noch besser ist als nichts.
 */
const KANDIDATEN = [
  "readme.md",
  "readme.markdown",
  "readme.mdown",
  "readme",
  "readme.txt",
  "readme.rst",
];

/**
 * Sucht aus einer Verzeichnisauflistung die README-Datei heraus.
 * Gross- und Kleinschreibung ist egal; die Reihenfolge oben entscheidet.
 */
export function pickReadme(namen: string[]): string | null {
  const klein = new Map(namen.map((name) => [name.toLowerCase(), name]));
  for (const kandidat of KANDIDATEN) {
    const treffer = klein.get(kandidat);
    if (treffer) return treffer;
  }
  return null;
}

/** Kuerzt am Deckel, aber an einer Zeilengrenze. */
export function capReadme(text: string): { content: string; truncated: boolean } {
  if (text.length <= README_MAX_CHARS) return { content: text, truncated: false };

  const roh = text.slice(0, README_MAX_CHARS);
  const letzterUmbruch = roh.lastIndexOf("\n");
  return {
    // Nur wenn der Umbruch nicht ganz am Anfang liegt – sonst bliebe fast
    // nichts uebrig.
    content: letzterUmbruch > README_MAX_CHARS / 2 ? roh.slice(0, letzterUmbruch) : roh,
    truncated: true,
  };
}

/**
 * Dekodiert, was die Anbieter als base64 liefern.
 *
 * Bewusst ueber Buffer und nicht ueber atob: der Inhalt ist UTF-8, und atob
 * gaebe Bytes zurueck, aus denen Umlaute als Kauderwelsch herauskaemen.
 */
export function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf8");
}
