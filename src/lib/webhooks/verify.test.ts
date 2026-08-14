import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEvent, verifySignature } from "./verify";

const GEHEIM = "ein-geheimnis-das-lang-genug-ist";
const RUMPF = JSON.stringify({ action: "closed", issue: { number: 12 } });

function signiere(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function kopf(eintraege: Record<string, string>): Headers {
  return new Headers(eintraege);
}

describe("verifySignature – GitHub", () => {
  it("nimmt die richtige Signatur an", () => {
    const headers = kopf({ "x-hub-signature-256": `sha256=${signiere(GEHEIM, RUMPF)}` });
    expect(verifySignature("GITHUB", GEHEIM, RUMPF, headers)).toEqual({ ok: true });
  });

  it("weist eine fremde Signatur ab", () => {
    const headers = kopf({ "x-hub-signature-256": `sha256=${signiere("anderes", RUMPF)}` });
    expect(verifySignature("GITHUB", GEHEIM, RUMPF, headers)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("weist ab, wenn der Rumpf veraendert wurde", () => {
    // Das ist der eigentliche Zweck: die Signatur haengt am Inhalt.
    const headers = kopf({ "x-hub-signature-256": `sha256=${signiere(GEHEIM, RUMPF)}` });
    const veraendert = JSON.stringify({ action: "closed", issue: { number: 99 } });
    expect(verifySignature("GITHUB", GEHEIM, veraendert, headers).ok).toBe(false);
  });

  it("weist ab, wenn gar keine Signatur mitkommt", () => {
    expect(verifySignature("GITHUB", GEHEIM, RUMPF, kopf({}))).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("laesst sich nicht mit dem blossen Praefix taeuschen", () => {
    expect(verifySignature("GITHUB", GEHEIM, RUMPF, kopf({ "x-hub-signature-256": "sha256=" })).ok).toBe(
      false,
    );
  });
});

describe("verifySignature – Gitea", () => {
  it("nimmt die Signatur ohne Praefix an", () => {
    const headers = kopf({ "x-gitea-signature": signiere(GEHEIM, RUMPF) });
    expect(verifySignature("GITEA", GEHEIM, RUMPF, headers)).toEqual({ ok: true });
  });

  it("nimmt ersatzweise das GitHub-Format an", () => {
    // Aeltere Gitea-Fassungen senden nur X-Hub-Signature-256.
    const headers = kopf({ "x-hub-signature-256": `sha256=${signiere(GEHEIM, RUMPF)}` });
    expect(verifySignature("GITEA", GEHEIM, RUMPF, headers)).toEqual({ ok: true });
  });

  it("weist eine falsche Signatur ab", () => {
    const headers = kopf({ "x-gitea-signature": signiere("anderes", RUMPF) });
    expect(verifySignature("GITEA", GEHEIM, RUMPF, headers).ok).toBe(false);
  });
});

describe("verifySignature – GitLab", () => {
  it("vergleicht den Token im Klartext", () => {
    expect(verifySignature("GITLAB", GEHEIM, RUMPF, kopf({ "x-gitlab-token": GEHEIM }))).toEqual({
      ok: true,
    });
  });

  it("weist einen falschen Token ab", () => {
    expect(
      verifySignature("GITLAB", GEHEIM, RUMPF, kopf({ "x-gitlab-token": "falsch" })).ok,
    ).toBe(false);
  });

  it("weist ab, wenn der Token fehlt", () => {
    expect(verifySignature("GITLAB", GEHEIM, RUMPF, kopf({}))).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});

describe("parseEvent", () => {
  it("erkennt einen Push", () => {
    expect(parseEvent("GITHUB", "push", {})).toEqual({ kind: "push" });
  });

  it("erkennt ein geschlossenes Issue bei GitHub und Gitea", () => {
    const nutzlast = { action: "closed", issue: { number: 12 } };
    expect(parseEvent("GITHUB", "issues", nutzlast)).toEqual({
      kind: "issue",
      number: 12,
      open: false,
    });
    expect(parseEvent("GITEA", "issues", nutzlast)).toEqual({
      kind: "issue",
      number: 12,
      open: false,
    });
  });

  it("erkennt ein wieder geoeffnetes Issue", () => {
    expect(parseEvent("GITHUB", "issues", { action: "reopened", issue: { number: 7 } })).toEqual({
      kind: "issue",
      number: 7,
      open: true,
    });
  });

  it("nimmt bei GitLab die projektinterne Nummer", () => {
    // "iid" ist die Nummer aus der Oberflaeche; "id" waere instanzweit.
    const ereignis = parseEvent("GITLAB", "Issue Hook", {
      object_kind: "issue",
      object_attributes: { iid: 5, state: "closed" },
    });
    expect(ereignis).toEqual({ kind: "issue", number: 5, open: false });
  });

  it("laesst Unbekanntes liegen, statt zu scheitern", () => {
    expect(parseEvent("GITHUB", "issue_comment", {}).kind).toBe("ignored");
    expect(parseEvent("GITHUB", "issues", { action: "labeled", issue: { number: 1 } }).kind).toBe(
      "ignored",
    );
    expect(parseEvent("GITHUB", null, null).kind).toBe("ignored");
  });

  it("laesst ein Issue ohne Nummer liegen", () => {
    expect(parseEvent("GITHUB", "issues", { action: "closed", issue: {} }).kind).toBe("ignored");
  });
});
