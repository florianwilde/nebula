import { describe, expect, it } from "vitest";
import {
  DUE_BUCKET_META,
  DUE_BUCKET_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  dueBucket,
  nextDueDate,
  progressFromTasks,
  spaltenAnzeige,
} from "./tasks";

describe("progressFromTasks", () => {
  it("rechnet den Anteil erledigter Aufgaben in Prozent um", () => {
    expect(progressFromTasks(4, 1)).toBe(25);
    expect(progressFromTasks(8, 3)).toBe(38);
    expect(progressFromTasks(3, 3)).toBe(100);
    expect(progressFromTasks(5, 0)).toBe(0);
  });

  it("gibt null zurueck, wenn es nichts zu rechnen gibt", () => {
    // Ohne Aufgaben bleibt der von Hand gesetzte Wert stehen.
    expect(progressFromTasks(0, 0)).toBeNull();
    expect(progressFromTasks(-1, 0)).toBeNull();
  });

  it("rundet kaufmaennisch statt abzuschneiden", () => {
    // 1/3 sind 33,33 % und 2/3 sind 66,67 %.
    expect(progressFromTasks(3, 1)).toBe(33);
    expect(progressFromTasks(3, 2)).toBe(67);
  });
});

describe("Spaltenreihenfolge", () => {
  it("fuehrt von offen nach erledigt", () => {
    expect(TASK_STATUS_ORDER).toEqual(["TODO", "DOING", "BLOCKED", "DONE"]);
  });

  it("hat zu jeder Spalte eine Beschriftung und eine Farbe", () => {
    for (const status of TASK_STATUS_ORDER) {
      expect(TASK_STATUS_META[status].label).toBeTruthy();
      expect(TASK_STATUS_META[status].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("nextDueDate", () => {
  const abhaken = (iso: string) => new Date(iso);

  it("rechnet vom bisherigen Termin, nicht vom Abhaken", () => {
    // Woechentlich, faellig Montag, erledigt erst Mittwoch: der naechste
    // Termin bleibt der Montag darauf, nicht der uebernaechste Mittwoch.
    const next = nextDueDate("WEEKLY", new Date("2026-07-06T12:00:00Z"), abhaken("2026-07-08T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-13");
  });

  it("nimmt ohne bisherigen Termin den Zeitpunkt des Abhakens", () => {
    const next = nextDueDate("DAILY", null, abhaken("2026-07-26T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-27");
  });

  it("schiebt so lange weiter, bis der Termin in der Zukunft liegt", () => {
    // Ein halbes Jahr liegengeblieben: die naechste Fassung darf nicht
    // schon bei ihrer Entstehung ueberfaellig sein.
    const next = nextDueDate("WEEKLY", new Date("2026-01-05T12:00:00Z"), abhaken("2026-07-26T09:00:00Z"));
    expect(next.getTime()).toBeGreaterThan(abhaken("2026-07-26T09:00:00Z").getTime());
    // Und es bleibt ein Montag.
    expect(next.getUTCDay()).toBe(1);
  });

  it("haelt beim Monatsintervall den Tag im Monat", () => {
    const next = nextDueDate("MONTHLY", new Date("2026-03-15T12:00:00Z"), abhaken("2026-03-16T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("rollt beim Monatsintervall nicht ueber kurze Monate hinweg", () => {
    // Der 31. Januar plus ein Monat ist der 28. Februar, nicht der 3. Maerz.
    const next = nextDueDate("MONTHLY", new Date("2026-01-31T12:00:00Z"), abhaken("2026-02-01T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("kennt zwei Wochen", () => {
    const next = nextDueDate("BIWEEKLY", new Date("2026-07-01T12:00:00Z"), abhaken("2026-07-02T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("endet auch bei einem absurd alten Termin", () => {
    // Ohne Deckel liefe die Schleife bei einem taeglichen Intervall und
    // einem Datum von 1970 sehr lange.
    const next = nextDueDate("DAILY", new Date("1970-01-01T00:00:00Z"), abhaken("2026-07-26T09:00:00Z"));
    expect(next instanceof Date).toBe(true);
    expect(Number.isNaN(next.getTime())).toBe(false);
  });
});

describe("dueBucket", () => {
  /** 14.08.2026, 17:30 Berliner Zeit – bewusst spaeter Nachmittag. */
  const JETZT = new Date("2026-08-14T15:30:00Z");

  it("ordnet eine Aufgabe ohne Termin nach hinten", () => {
    expect(dueBucket(null, JETZT)).toBe("someday");
  });

  it("zaehlt den heutigen Tag als heute, auch wenn die Uhrzeit vorbei ist", () => {
    // Der Punkt der Funktion: gerechnet wird auf Kalendertage. Um 9 Uhr
    // faellig und jetzt ist es halb sechs – die Aufgabe steht trotzdem
    // unter "Heute" und nicht unter "Ueberfaellig".
    expect(dueBucket(new Date("2026-08-14T07:00:00Z"), JETZT)).toBe("today");
  });

  it("erkennt den Vortag als ueberfaellig", () => {
    expect(dueBucket(new Date("2026-08-13T21:00:00Z"), JETZT)).toBe("overdue");
  });

  it("fasst die kommenden sieben Tage als diese Woche", () => {
    expect(dueBucket(new Date("2026-08-15T06:00:00Z"), JETZT)).toBe("week");
    expect(dueBucket(new Date("2026-08-21T06:00:00Z"), JETZT)).toBe("week");
  });

  it("schiebt alles danach nach spaeter", () => {
    expect(dueBucket(new Date("2026-08-22T06:00:00Z"), JETZT)).toBe("later");
  });

  it("richtet sich nach Berliner Kalendertagen, nicht nach UTC", () => {
    // 21:30 UTC ist in Berlin schon 23:30 desselben Tages – im Container
    // laeuft die Anwendung aber nach UTC. Ohne feste Zeitzone kippte die
    // Einteilung hier um einen Tag.
    const spaetAbends = new Date("2026-08-15T21:30:00Z");
    expect(dueBucket(new Date("2026-08-15T10:00:00Z"), spaetAbends)).toBe("today");
    expect(dueBucket(new Date("2026-08-16T10:00:00Z"), spaetAbends)).toBe("week");
  });

  it("hat zu jedem Fach eine Beschriftung und eine Farbe", () => {
    for (const bucket of DUE_BUCKET_ORDER) {
      expect(DUE_BUCKET_META[bucket].label).toBeTruthy();
      expect(DUE_BUCKET_META[bucket].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("spaltenAnzeige", () => {
  it("zeigt alles, solange die Spalte unter der Grenze bleibt", () => {
    expect(spaltenAnzeige(3, 15, false)).toEqual({ sichtbar: 3, verborgen: 0 });
    // Genau auf der Grenze ist noch nichts zu verbergen – sonst stuende
    // "0 weitere anzeigen" an der Spalte.
    expect(spaltenAnzeige(15, 15, false)).toEqual({ sichtbar: 15, verborgen: 0 });
  });

  it("kappt darueber und sagt, wie viele dahinter warten", () => {
    expect(spaltenAnzeige(40, 15, false)).toEqual({ sichtbar: 15, verborgen: 25 });
  });

  it("nimmt 0 als 'ohne Begrenzung'", () => {
    // Dieselbe Lesart wie SESSION_IDLE_HOURS. Waere 0 woertlich gemeint,
    // zeigte das Brett gar nichts mehr.
    expect(spaltenAnzeige(200, 0, false)).toEqual({ sichtbar: 200, verborgen: 0 });
  });

  it("behandelt eine negative Grenze wie keine", () => {
    // Die API laesst sie nicht durch; ein alter Datenbankstand oder ein
    // Handgriff in psql koennte sie aber liefern.
    expect(spaltenAnzeige(9, -5, false)).toEqual({ sichtbar: 9, verborgen: 0 });
  });

  it("zeigt entfaltet wieder alles", () => {
    expect(spaltenAnzeige(40, 15, true)).toEqual({ sichtbar: 40, verborgen: 0 });
  });

  it("meldet nie mehr Sichtbares als vorhanden", () => {
    // Sonst liefe das slice() in der Spalte ins Leere und die Zahl am Knopf
    // waere negativ.
    for (const anzahl of [0, 1, 7, 15, 16, 99]) {
      for (const limit of [0, 1, 15, 100]) {
        for (const entfaltet of [true, false]) {
          const { sichtbar, verborgen } = spaltenAnzeige(anzahl, limit, entfaltet);
          expect(sichtbar, `${anzahl}/${limit}/${entfaltet}`).toBeLessThanOrEqual(anzahl);
          expect(verborgen).toBeGreaterThanOrEqual(0);
          // Zusammen ergeben sie immer die ganze Spalte – nichts faellt weg.
          expect(sichtbar + verborgen).toBe(anzahl);
        }
      }
    }
  });
});
