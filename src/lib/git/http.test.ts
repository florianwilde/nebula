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
