import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

/**
 * Markdown kommt aus zwei Quellen, denen nicht zu trauen ist: eigenen
 * Notizen (die zwar der Benutzer schreibt, aber ohne Bereinigung ein
 * XSS-Loch waeren) und dem README eines fremden Repositories.
 *
 * Diese Tests halten die Bereinigung fest. Sie rendern serverseitig, was
 * fuer die Frage genuegt – es geht um das erzeugte HTML, nicht um
 * Verhalten im Browser.
 */

const html = (text: string, baseUrl?: string) =>
  renderToStaticMarkup(<Markdown baseUrl={baseUrl}>{text}</Markdown>);

describe("Bereinigung", () => {
  it("laesst kein script durch", () => {
    const ausgabe = html("<script>alert(1)</script>\n\nText danach.");
    expect(ausgabe).not.toContain("<script");
    expect(ausgabe).not.toContain("alert(1)");
    expect(ausgabe).toContain("Text danach.");
  });

  it("entfernt Ereignis-Attribute aus rohem HTML", () => {
    const ausgabe = html('<img src="x" onerror="alert(1)">');
    expect(ausgabe).not.toContain("onerror");
    expect(ausgabe).not.toContain("alert");
  });

  it("laesst kein javascript: als Link durch", () => {
    const ausgabe = html("[klick](javascript:alert(1))");
    expect(ausgabe).not.toContain("javascript:");
  });

  it("laesst kein javascript: ueber ein Bild durch", () => {
    // Das Bild wird zu einem Link umgebaut – die Quelle darf dabei nicht
    // unbesehen zum href werden.
    const ausgabe = html("![x](javascript:alert(1))");
    expect(ausgabe).not.toContain("javascript:");
  });

  it("laesst kein data: mit HTML durch", () => {
    const ausgabe = html("[klick](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)");
    expect(ausgabe).not.toContain("data:text/html");
  });

  it("haengt an jeden Link noopener und noreferrer", () => {
    const ausgabe = html("[Ziel](https://example.com)");
    expect(ausgabe).toContain('target="_blank"');
    expect(ausgabe).toContain("noopener");
    expect(ausgabe).toContain("noreferrer");
  });

  it("laedt keine Bilder, sondern zeigt eine Marke", () => {
    // Die Content-Security-Policy erlaubt img-src nur von der eigenen
    // Instanz; ein fremdes README duerfte sonst Zaehlpixel nachladen.
    const ausgabe = html("![Abzeichen](https://example.com/badge.svg)");
    expect(ausgabe).not.toContain("<img");
    expect(ausgabe).toContain("md-image");
    expect(ausgabe).toContain("Abzeichen");
  });
});

describe("Relative Verweise", () => {
  const BASIS = "https://git.example.com/o/r/blob/main/";

  it("loest relative Links gegen die Basis auf", () => {
    expect(html("[Doku](docs/x.md)", BASIS)).toContain(`${BASIS}docs/x.md`);
  });

  it("laesst absolute Links und Anker in Ruhe", () => {
    expect(html("[Extern](https://example.com/a)", BASIS)).toContain("https://example.com/a");
    expect(html("[Anker](#titel)", BASIS)).toContain('href="#titel"');
  });

  it("laesst ohne Basis alles unveraendert", () => {
    expect(html("[Doku](docs/x.md)")).toContain('href="docs/x.md"');
  });

  it("erzeugt aus einem Bild im Link keinen Link im Link", () => {
    // "[![Abzeichen](bild)](ziel)" ist in READMEs die Regel. Ein a im a ist
    // ungueltiges HTML; der Browser zieht es auseinander, was zu einem
    // Hydrationsfehler fuehrt – genau daran ist der erste Versuch gescheitert.
    const ausgabe = html("[![Abzeichen](img/b.svg)](https://example.com/ziel)", BASIS);
    expect(ausgabe).toContain("<span");
    expect(ausgabe.match(/<a /g) ?? []).toHaveLength(1);
  });
});
