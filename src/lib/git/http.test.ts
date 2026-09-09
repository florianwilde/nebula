import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Teilabrufe, zeitlimit } from "./http";

/**
 * Diese beiden Stellen haben zusammen einen Ausfall verursacht, den niemand
 * sehen konnte: Der Abgleich holte die Listen eines Repositories, verlor sie
 * unterwegs, verwandelte jeden Fehler in eine leere Liste und meldete
 * "Snapshot aktualisiert: 0 Branches, 0 Tags". Aus der Oberflaeche war nicht
 * zu erkennen, dass ueberhaupt etwas schiefgegangen war.
 */

describe("zeitlimit", () => {
  it("nimmt einen brauchbaren Wert", () => {
    expect(zeitlimit("30000")).toBe(30000);
    expect(zeitlimit(" 20000 ")).toBe(20000);
  });

  it("faellt ohne Angabe auf die Vorgabe zurueck", () => {
    expect(zeitlimit(undefined)).toBe(15000);
    expect(zeitlimit("")).toBe(15000);
    expect(zeitlimit("   ")).toBe(15000);
  });

  it("faengt genau die Werte ab, die alles stillgelegt haetten", () => {
    // Number("") ist 0, Number("abc") ist NaN. setTimeout loest bei beidem
    // sofort aus – jeder ausgehende Aufruf braeche ab, bevor er beginnt,
    // und der Abgleich meldete ueberall leere Listen.
    const warnungen: string[] = [];
    const merken = (text: string) => warnungen.push(text);

    expect(zeitlimit("0", merken)).toBe(15000);
    expect(zeitlimit("abc", merken)).toBe(15000);
    expect(zeitlimit("-5000", merken)).toBe(15000);
    expect(zeitlimit("500", merken)).toBe(15000);

    // Und zwar nicht stillschweigend.
    expect(warnungen).toHaveLength(4);
    for (const warnung of warnungen) {
      expect(warnung).toContain("GIT_API_TIMEOUT_MS");
    }
  });
});

describe("Teilabrufe", () => {
  // Vor jedem Aufruf prueft der SSRF-Schutz das Ziel und loest dafuer den
  // Hostnamen auf. Eine ausdrueckliche Freigabe ueberspringt das – sonst
  // haengt der Test an einem DNS-Server und misst nicht, was er messen will.
  beforeEach(() => {
    vi.stubEnv("GIT_ALLOWED_HOSTS", "git.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Ohne das zaehlen die Spies ueber Tests hinweg weiter – und genau an
    // Aufrufzahlen haengen die Pruefungen hier.
    vi.restoreAllMocks();
  });

  it("meldet nichts, solange alles ankommt", async () => {
    const teil = new Teilabrufe();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ name: "main" }]), { status: 200 }),
    );

    const wert = await teil.hol("branches", "https://git.example.com/api/v1/x", []);

    expect(wert).toEqual([{ name: "main" }]);
    expect(teil.fehler).toEqual({});
    expect(teil.unvollstaendig).toBe(false);
  });

  it("gibt den Fallback zurueck, haelt aber den Grund fest", async () => {
    // Der Kern des Fehlers: vorher war dieser Fall von "das Repository hat
    // keine Branches" nicht zu unterscheiden.
    const teil = new Teilabrufe();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("no scopes", { status: 403 }),
    );

    const wert = await teil.hol("branches", "https://git.example.com/api/v1/x", []);

    expect(wert).toEqual([]);
    expect(teil.unvollstaendig).toBe(true);
    expect(teil.fehler.branches).toContain("403");
  });

  it("nennt den Status, weil daran die Ursache haengt", async () => {
    // 403 heisst Scopes, 429 Rate-Limit, 408 Zeitueberschreitung. Ohne die
    // Zahl bliebe nur "hat nicht geklappt".
    const teil = new Teilabrufe();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("slow down", { status: 429 }));

    await teil.hol("tags", "https://git.example.com/api/v1/x", []);

    expect(teil.fehler.tags).toMatch(/429/);
  });

  it("haelt mehrere Fehlschlaege getrennt auseinander", async () => {
    const teil = new Teilabrufe();
    let aufruf = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      aufruf += 1;
      // Der zweite geht durch – ein Teilausfall ist der haeufige Fall.
      return aufruf === 2
        ? new Response(JSON.stringify([1, 2]), { status: 200 })
        : new Response("nope", { status: 403 });
    });

    const [branches, tags, commits] = await Promise.all([
      teil.hol("branches", "https://git.example.com/a", []),
      teil.hol("tags", "https://git.example.com/b", []),
      teil.hol("commits", "https://git.example.com/c", []),
    ]);

    expect(branches).toEqual([]);
    expect(tags).toEqual([1, 2]);
    expect(commits).toEqual([]);
    expect(Object.keys(teil.fehler).sort()).toEqual(["branches", "commits"]);
  });

  it("faengt auch einen Abbruch ab, nicht nur eine Fehlerantwort", async () => {
    const teil = new Teilabrufe();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket hang up"));

    const wert = await teil.hol("commits", "https://git.example.com/api/v1/x", []);

    expect(wert).toEqual([]);
    expect(teil.fehler.commits).toBeTruthy();
  });
});

/**
 * Der zweite Versuch.
 *
 * Beobachtet an einer laufenden Instanz: zwei von acht Teil-Abrufen liefen
 * in eine Zeitueberschreitung nach 15 s, waehrend dieselben Aufrufe von
 * aussen einzeln in 80 ms antworteten. Nicht die Endpunkte sind langsam –
 * die Achterrunde erwuergt sich gelegentlich selbst.
 */
describe("Teilabrufe: Nachschlag", () => {
  beforeEach(() => {
    vi.stubEnv("GIT_ALLOWED_HOSTS", "git.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Ohne das zaehlen die Spies ueber Tests hinweg weiter – und genau an
    // Aufrufzahlen haengen die Pruefungen hier.
    vi.restoreAllMocks();
  });

  /** Antwortet die ersten `fehlschlaege` Male mit Abbruch, danach mit Daten. */
  function zaehlend(fehlschlaege: number, status = 408) {
    let aufruf = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      aufruf += 1;
      if (aufruf <= fehlschlaege) {
        if (status === 408) {
          const abbruch = new Error("aborted");
          abbruch.name = "AbortError";
          throw abbruch;
        }
        return new Response("nope", { status });
      }
      return new Response(JSON.stringify(["da"]), { status: 200 });
    });
  }

  it("holt eine Zeitueberschreitung im zweiten Versuch nach", async () => {
    const fetchSpy = zaehlend(1);
    const teil = new Teilabrufe();

    const wert = await teil.hol("branches", "https://git.example.com/a", []);

    expect(wert).toEqual(["da"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Geglueckt heisst: kein Eintrag. Sonst stuende am Repository ein
    // Fehler, den es nicht mehr gibt.
    expect(teil.fehler).toEqual({});
    expect(teil.unvollstaendig).toBe(false);
  });

  it("vermerkt es, wenn auch der zweite Versuch scheitert", async () => {
    const fetchSpy = zaehlend(99);
    const teil = new Teilabrufe();

    const wert = await teil.hol("commits", "https://git.example.com/a", []);

    expect(wert).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(teil.fehler.commits).toContain("408");
    expect(teil.fehler.commits).toContain("zweiten Versuch");
  });

  it("schlaegt bei 403 gar nicht erst nach", async () => {
    // Fehlende Scopes werden durch Wiederholen nicht besser.
    const fetchSpy = zaehlend(99, 403);
    const teil = new Teilabrufe();

    await teil.hol("tags", "https://git.example.com/a", []);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(teil.fehler.tags).not.toContain("zweiten Versuch");
  });

  it("schlaegt bei 429 nicht nach", async () => {
    // Sofortiges Wiederholen macht ein Rate-Limit schlimmer, nicht besser.
    const fetchSpy = zaehlend(99, 429);
    const teil = new Teilabrufe();

    await teil.hol("issues", "https://git.example.com/a", []);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("gibt hoechstens zwei Nachschlaege je Abgleich", async () => {
    // Acht Zeitueberschreitungen zu je 15 s waeren zwei Minuten. Wer weg
    // ist, soll schnell als weg erkannt werden.
    const fetchSpy = zaehlend(99);
    const teil = new Teilabrufe();

    await Promise.all([
      teil.hol("branches", "https://git.example.com/a", []),
      teil.hol("tags", "https://git.example.com/b", []),
      teil.hol("commits", "https://git.example.com/c", []),
      teil.hol("releases", "https://git.example.com/d", []),
    ]);

    // Vier erste Versuche, aber nur zwei Nachschlaege.
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    expect(Object.keys(teil.fehler).sort()).toEqual([
      "branches",
      "commits",
      "releases",
      "tags",
    ]);
  });

  it("reisst die Kette nicht ab, wenn ein Nachschlag scheitert", async () => {
    // Der erste Nachschlag geht schief, der zweite muss trotzdem laufen.
    let aufruf = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      aufruf += 1;
      // 1 und 2 sind die ersten Versuche, 3 der erste Nachschlag (scheitert),
      // 4 der zweite Nachschlag (glueckt).
      if (aufruf <= 3) {
        const abbruch = new Error("aborted");
        abbruch.name = "AbortError";
        throw abbruch;
      }
      return new Response(JSON.stringify(["da"]), { status: 200 });
    });

    const teil = new Teilabrufe();
    const [erst, zweit] = await Promise.all([
      teil.hol("branches", "https://git.example.com/a", []),
      teil.hol("tags", "https://git.example.com/b", []),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(erst).toEqual([]);
    expect(zweit).toEqual(["da"]);
    expect(Object.keys(teil.fehler)).toEqual(["branches"]);
  });
});
