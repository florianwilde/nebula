import { describe, expect, it } from "vitest";
import {
  TOTP_PERIOD,
  base32Decode,
  base32Encode,
  counterFor,
  generateTotpSecret,
  groupSecret,
  matchTotp,
  otpauthUri,
  totpCode,
  verifyTotp,
} from "./totp";

describe("Base32", () => {
  // Testvektoren aus RFC 4648, Abschnitt 10 – ohne die Auffuellzeichen,
  // die Authenticator-Apps nicht erwarten.
  it.each([
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("kodiert %j als %j", (klartext, erwartet) => {
    expect(base32Encode(Buffer.from(klartext, "utf8"))).toBe(erwartet);
  });

  it("dekodiert zurueck, auch mit Leerzeichen und Auffuellzeichen", () => {
    expect(base32Decode("MZXW6YTBOI").toString("utf8")).toBe("foobar");
    expect(base32Decode("mzxw 6ytb oi").toString("utf8")).toBe("foobar");
    expect(base32Decode("MZXW6YTBOI======").toString("utf8")).toBe("foobar");
  });

  it("weist fremde Zeichen ab, statt still Unsinn zu liefern", () => {
    // 0, 1 und 8 gehoeren nicht zum Alphabet – gerade sie werden aber gern
    // mit O, I und B verwechselt.
    expect(() => base32Decode("MZXW0YTB")).toThrow();
  });
});

describe("TOTP nach RFC 6238", () => {
  // Der Schluessel aus Anhang B des RFC: die ASCII-Ziffern 1234567890,
  // zweimal hintereinander.
  const SECRET = base32Encode(Buffer.from("12345678901234567890", "utf8"));

  /**
   * Der RFC nennt achtstellige Codes. Sechs Stellen sind davon die letzten
   * sechs – gerechnet wird modulo 10^6 statt 10^8.
   */
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("liefert zum Zeitpunkt %i den Code %s", (sekunden, erwartet) => {
    const counter = Math.floor(sekunden / TOTP_PERIOD);
    expect(totpCode(SECRET, counter)).toBe(erwartet);
  });

  it("rechnet Zeitpunkte in Fenster um", () => {
    expect(counterFor(new Date(59_000))).toBe(1);
    expect(counterFor(new Date(1111111109_000))).toBe(37037036);
  });
});

describe("verifyTotp", () => {
  const SECRET = base32Encode(Buffer.from("12345678901234567890", "utf8"));
  const JETZT = new Date(1111111109_000);

  it("nimmt den Code des aktuellen Fensters an", () => {
    expect(verifyTotp(SECRET, "081804", JETZT)).toBe(true);
  });

  it("nimmt auch das vorige und das naechste Fenster an", () => {
    // Eine um bis zu 30 Sekunden falsch gehende Uhr soll niemanden aussperren.
    const vorher = new Date(JETZT.getTime() - TOTP_PERIOD * 1000);
    const nachher = new Date(JETZT.getTime() + TOTP_PERIOD * 1000);
    expect(verifyTotp(SECRET, "081804", vorher)).toBe(true);
    expect(verifyTotp(SECRET, "081804", nachher)).toBe(true);
  });

  it("lehnt ein Fenster weiter ab", () => {
    const zuFrueh = new Date(JETZT.getTime() - 2 * TOTP_PERIOD * 1000);
    expect(verifyTotp(SECRET, "081804", zuFrueh)).toBe(false);
  });

  it("lehnt falsche Codes und Unfug ab", () => {
    expect(verifyTotp(SECRET, "000000", JETZT)).toBe(false);
    expect(verifyTotp(SECRET, "", JETZT)).toBe(false);
    expect(verifyTotp(SECRET, "81804", JETZT)).toBe(false);
    expect(verifyTotp(SECRET, "abcdef", JETZT)).toBe(false);
    // Fuehrende Nullen duerfen nicht als Zahl verlorengehen.
    expect(verifyTotp(SECRET, "81804 ", JETZT)).toBe(false);
  });

  it("sieht ueber Leerzeichen in der Eingabe hinweg", () => {
    expect(verifyTotp(SECRET, "081 804", JETZT)).toBe(true);
  });
});

describe("Einrichtung", () => {
  it("erzeugt Schluessel, die sich unterscheiden und lang genug sind", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    // 20 Byte ergeben 32 Base32-Zeichen.
    expect(a).toHaveLength(32);
    expect(base32Decode(a)).toHaveLength(20);
  });

  it("baut eine otpauth-URI mit Aussteller im Label und im Parameter", () => {
    const uri = otpauthUri({ secret: "ABCD", account: "chefin", issuer: "Nebula" });
    expect(uri).toContain("otpauth://totp/Nebula%3Achefin?");
    expect(uri).toContain("secret=ABCD");
    expect(uri).toContain("issuer=Nebula");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("gruppiert den Schluessel zum Abtippen", () => {
    expect(groupSecret("ABCDEFGH")).toBe("ABCD EFGH");
  });
});

describe("matchTotp", () => {
  const SECRET = base32Encode(Buffer.from("12345678901234567890", "utf8"));
  const JETZT = new Date(1111111109_000);

  /**
   * Der Zaehler ist noetig, um einen verbrauchten Code zu entwerten. RFC 6238
   * verlangt das in Abschnitt 5.2 ausdruecklich – sonst laesst sich ein
   * abgefangener Code die restliche Gueltigkeitsdauer ueber wiederverwenden.
   */
  it("gibt das Zeitfenster zurueck, das gepasst hat", () => {
    expect(matchTotp(SECRET, "081804", JETZT)).toBe(37037036);
  });

  it("nennt bei den Nachbarfenstern deren eigene Nummer", () => {
    // Genau daran haengt die Entwertung: der Code aus dem vorigen Fenster
    // darf den Merker nicht auf einen hoeheren Stand setzen.
    const naechstes = new Date(JETZT.getTime() + TOTP_PERIOD * 1000);
    expect(matchTotp(SECRET, "081804", naechstes)).toBe(37037036);
  });

  it("liefert null bei falschem Code", () => {
    expect(matchTotp(SECRET, "000000", JETZT)).toBeNull();
  });

  it("stimmt mit verifyTotp ueberein", () => {
    expect(matchTotp(SECRET, "081804", JETZT) !== null).toBe(verifyTotp(SECRET, "081804", JETZT));
    expect(matchTotp(SECRET, "000000", JETZT) !== null).toBe(verifyTotp(SECRET, "000000", JETZT));
  });
});
