import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Task } from "@prisma/client";
import { TaskCard } from "./TaskCard";

/**
 * Die Karte ist die einzige Stelle im Projekt, an der eine Aufgabe im
 * Vorbeigehen zu sehen ist – der Bearbeiten-Dialog verlangt einen Klick.
 * Steht die Verknuepfung nur dort, weiss niemand vorher, welche Aufgabe
 * ein Issue hat.
 *
 * Serverseitig gerendert wie bei Markdown.test.tsx: es geht um das
 * erzeugte Markup, nicht um Verhalten im Browser.
 */
function aufgabe(felder: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "p1",
    title: "Etwas tun",
    description: null,
    status: "TODO",
    position: 0,
    dueDate: null,
    labels: [],
    recurrence: null,
    sourceIssue: null,
    sourceUrl: null,
    sourceRepositoryId: null,
    createdAt: new Date("2026-08-18T10:00:00Z"),
    updatedAt: new Date("2026-08-18T10:00:00Z"),
    ...felder,
  } as Task;
}

const markup = (task: Task) => renderToStaticMarkup(<TaskCard task={task} />);

describe("Kennzeichen fuer ein verknuepftes Issue", () => {
  it("zeigt die Nummer, sobald eine Aufgabe an einem Issue haengt", () => {
    const html = markup(aufgabe({ sourceIssue: 42 }));
    expect(html).toContain("#42");
    expect(html).toContain("Verkn");
  });

  it("erscheint auch ohne Beschreibung, Datum und Labels", () => {
    // Der eigentliche Fallstrick: die Fusszeile der Karte wird nur
    // gerendert, wenn es etwas zu zeigen gibt. Faellt die Verknuepfung aus
    // dieser Bedingung heraus, bleibt genau die nackte Aufgabe unbeschriftet
    // – und das ist der haeufige Fall bei einer aus einem Issue erzeugten.
    const html = markup(
      aufgabe({ sourceIssue: 7, description: null, dueDate: null, labels: [], recurrence: null }),
    );
    expect(html).toContain("#7");
  });

  it("bleibt weg, wenn keine Verknuepfung besteht", () => {
    const html = markup(aufgabe({ description: "Text" }));
    expect(html).not.toContain("Verkn");
  });

  it("bleibt auf einer erledigten Aufgabe sichtbar", () => {
    // Die erledigte Karte streicht ihren Titel durch; das Kennzeichen bleibt
    // in voller Helligkeit. Abzudunkeln war versucht und wieder verworfen –
    // axe-core rechnete es als Kontrastverstoss ab (10px Text, 3,2:1).
    // Dass hier ein Issue mitgeschlossen wurde, ist ohnehin gerade dann die
    // interessante Auskunft.
    const html = markup(aufgabe({ sourceIssue: 5, status: "DONE" }));
    expect(html).toContain("#5");
  });

  it("baut keinen Link in die Karte", () => {
    // Die Karte steckt in einem <button>; ein <a> darin waere ungueltiges
    // Markup und im Browser nicht verlaesslich anklickbar.
    const html = markup(aufgabe({ sourceIssue: 42, sourceUrl: "https://example.com/issues/42" }));
    expect(html).not.toContain("<a ");
  });

  it("nennt die Verknuepfung auch fuer Vorlesesoftware", () => {
    // "#42" allein ergibt vorgelesen keinen Sinn.
    const html = markup(aufgabe({ sourceIssue: 42 }));
    expect(html).toMatch(/sr-only[^>]*>Verkn/);
  });
});
