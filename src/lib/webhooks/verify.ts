import { createHmac, timingSafeEqual } from "node:crypto";
import type { GitProvider } from "@prisma/client";

/**
 * Pruefung eingehender Webhooks.
 *
 * Der Endpunkt ist die einzige Stelle der Anwendung, die ohne Anmeldung
 * schreibend wirkt – deshalb steht die Pruefung hier fuer sich, ohne
 * Datenbank und ohne Netz, und ist damit vollstaendig testbar.
 *
 * Die drei Systeme machen es unterschiedlich:
 *
 *   GitHub  X-Hub-Signature-256: "sha256=<hex>", HMAC-SHA256 ueber den Rumpf
 *   Gitea   X-Gitea-Signature:   "<hex>" ohne Praefix, sonst gleich
 *   GitLab  X-Gitlab-Token:      das Geheimnis im Klartext, keine Signatur
 *
 * GitLabs Verfahren ist schwaecher – es beweist nur, dass der Absender das
 * Geheimnis kennt, nicht dass der Rumpf unveraendert ist. Mehr gibt die
 * Plattform nicht her; verglichen wird trotzdem zeitkonstant.
 */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "mismatch" | "unsupported" };

/** Vergleich ohne Laufzeitunterschied – ein Zeichenvergleich waere angreifbar. */
function equals(a: string, b: string): boolean {
  const links = Buffer.from(a, "utf8");
  const rechts = Buffer.from(b, "utf8");
  // timingSafeEqual verlangt gleiche Laenge und wirft sonst. Die Laenge
  // selbst ist kein Geheimnis, der fruehe Ausstieg also unbedenklich.
  if (links.length !== rechts.length) return false;
  return timingSafeEqual(links, rechts);
}

function hmacHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Prueft die Signatur eines eingehenden Aufrufs.
 *
 * `body` muss der **rohe** Rumpf sein, genau wie er ankam. Ein durch
 * JSON.parse und JSON.stringify gedrehter Rumpf hat eine andere Signatur –
 * andere Reihenfolge, anderes Escaping, kein Leerraum.
 */
export function verifySignature(
  provider: GitProvider,
  secret: string,
  body: string,
  headers: Headers,
): VerifyResult {
  switch (provider) {
    case "GITHUB": {
      const gesendet = headers.get("x-hub-signature-256");
      if (!gesendet) return { ok: false, reason: "missing" };
      const erwartet = `sha256=${hmacHex(secret, body)}`;
      return equals(gesendet, erwartet) ? { ok: true } : { ok: false, reason: "mismatch" };
    }

    case "GITEA": {
      // Gitea schickt die Signatur ohne Praefix. Aeltere Fassungen senden
      // zusaetzlich X-Hub-Signature-256 im GitHub-Format – beides gilt.
      const gitea = headers.get("x-gitea-signature");
      if (gitea) {
        return equals(gitea, hmacHex(secret, body))
          ? { ok: true }
          : { ok: false, reason: "mismatch" };
      }
      const hub = headers.get("x-hub-signature-256");
      if (hub) {
        return equals(hub, `sha256=${hmacHex(secret, body)}`)
          ? { ok: true }
          : { ok: false, reason: "mismatch" };
      }
      return { ok: false, reason: "missing" };
    }

    case "GITLAB": {
      const token = headers.get("x-gitlab-token");
      if (!token) return { ok: false, reason: "missing" };
      return equals(token, secret) ? { ok: true } : { ok: false, reason: "mismatch" };
    }

    default:
      return { ok: false, reason: "unsupported" };
  }
}

/** Welches Ereignis kam an – auf einen gemeinsamen Nenner gebracht. */
export type WebhookEvent =
  | { kind: "push" }
  | { kind: "issue"; number: number; open: boolean }
  | { kind: "ignored"; name: string };

interface IssuePayload {
  action?: string;
  issue?: { number?: number; iid?: number; state?: string };
  object_attributes?: { iid?: number; action?: string; state?: string };
  object_kind?: string;
}

/**
 * Uebersetzt den Rumpf in ein Ereignis, das die Anwendung kennt.
 *
 * Bewusst grob: Nebula interessiert nur, ob ein Push kam (dann lohnt ein
 * Abgleich) und ob ein Issue geschlossen oder wieder geoeffnet wurde (dann
 * wandert die Aufgabe mit). Alles andere wird benannt und liegen gelassen.
 */
export function parseEvent(
  provider: GitProvider,
  eventName: string | null,
  payload: unknown,
): WebhookEvent {
  const daten = (payload ?? {}) as IssuePayload;
  const name = (eventName ?? daten.object_kind ?? "").toLowerCase();

  if (name === "push" || name === "push hook") return { kind: "push" };

  if (provider === "GITLAB") {
    if (name !== "issue" && name !== "issue hook") return { kind: "ignored", name };
    const attrs = daten.object_attributes;
    const nummer = attrs?.iid;
    if (typeof nummer !== "number") return { kind: "ignored", name };
    // GitLab meldet den Zustand als "opened" oder "closed".
    const offen = attrs?.state !== "closed";
    return { kind: "issue", number: nummer, open: offen };
  }

  // GitHub und Gitea nennen das Ereignis "issues" und legen die Tat in
  // "action" ab. Umbenennungen und Kommentare interessieren hier nicht.
  if (name !== "issues") return { kind: "ignored", name };
  const nummer = daten.issue?.number;
  if (typeof nummer !== "number") return { kind: "ignored", name };
  if (daten.action !== "closed" && daten.action !== "reopened" && daten.action !== "opened") {
    return { kind: "ignored", name: `issues.${daten.action ?? "?"}` };
  }
  return { kind: "issue", number: nummer, open: daten.action !== "closed" };
}
