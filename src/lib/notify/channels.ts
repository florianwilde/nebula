import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import type { NotificationTarget } from "@prisma/client";
import { tryDecryptSecret } from "@/lib/crypto";
import { APP_NAME, APP_URL } from "@/lib/config";
import { BlockedHostError, assertAllowedUrl } from "@/lib/security/ssrf";
import type { DeliveryResult, NotificationMessage } from "./types";

/**
 * Zustellung einer Nachricht ueber den gewaehlten Weg.
 *
 * Zwei Dinge gelten fuer alle Wege:
 *  - Die Zieladresse ist eine Benutzereingabe und wird serverseitig
 *    abgerufen. Sie laeuft deshalb durch denselben SSRF-Schutz wie die
 *    Git-Verbindungen. Ein ntfy im eigenen Netz bleibt damit erlaubt,
 *    Loopback und Metadaten-Endpunkte nicht.
 *  - Fehler werden zurueckgegeben, nicht geworfen. Eine kaputte
 *    Benachrichtigung darf einen Abgleich nicht scheitern lassen.
 */

const TIMEOUT_MS = Number(process.env.NOTIFY_TIMEOUT_MS ?? 10_000);

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<DeliveryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: controller.signal,
      // Ein Redirect koennte auf ein anderes Ziel fuehren, als geprueft
      // wurde – deshalb gar nicht erst folgen.
      redirect: "manual",
    });
    if (!response.ok && response.status !== 0) {
      return { ok: false, message: `Antwort ${response.status} von ${new URL(url).host}` };
    }
    return { ok: true, message: `Zugestellt (${response.status})` };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: `Zeitueberschreitung nach ${TIMEOUT_MS} ms` };
    }
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function sendWebhook(
  target: NotificationTarget,
  message: NotificationMessage,
): Promise<DeliveryResult> {
  const payload = {
    source: APP_NAME,
    event: message.event,
    title: message.title,
    body: message.body,
    url: message.url,
    project: message.project,
    at: message.at,
  };
  const raw = JSON.stringify(payload);

  const headers: Record<string, string> = { "User-Agent": `${APP_NAME}-Notify` };

  // Mit Geheimnis wird der Rumpf signiert, damit der Empfaenger pruefen
  // kann, dass die Nachricht wirklich von hier kommt.
  const secret = tryDecryptSecret(target.secretCipher);
  if (secret) {
    headers["X-Nebula-Signature"] = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  }

  return postJson(target.target, raw, headers);
}

async function sendNtfy(
  target: NotificationTarget,
  message: NotificationMessage,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = {
    Title: encodeHeader(message.title),
    Priority: message.priority === "high" ? "high" : "default",
    Tags: message.event === "TEST" ? "bell" : "warning",
  };
  if (message.url) headers.Click = message.url;

  const secret = tryDecryptSecret(target.secretCipher);
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target.target, {
      method: "POST",
      // ntfy nimmt den Rumpf als reinen Text.
      headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
      body: message.body,
      signal: controller.signal,
      redirect: "manual",
    });
    if (!response.ok) {
      return { ok: false, message: `Antwort ${response.status} von ntfy` };
    }
    return { ok: true, message: "An ntfy zugestellt" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: `Zeitueberschreitung nach ${TIMEOUT_MS} ms` };
    }
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kopfzeilen duerfen nur Latin-1 enthalten. Emojis werden deshalb entfernt,
 * nicht durch Fragezeichen ersetzt – aus "🔴 Projekt: CI ist rot" wuerde
 * sonst "?? Projekt: CI ist rot". Das Sinnbild traegt ohnehin der
 * Tags-Header, den ntfy selbst in ein Symbol umsetzt.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x20-\xFF]/g, "").replace(/\s+/g, " ").trim();
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** Liest die SMTP-Einstellungen aus der Umgebung, falls vorhanden. */
export function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port,
    // Port 465 spricht von Anfang an TLS, 587 steigt per STARTTLS um.
    secure: process.env.SMTP_SECURE
      ? /^(1|true|yes|on)$/i.test(process.env.SMTP_SECURE)
      : port === 465,
    user: process.env.SMTP_USER?.trim() || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: process.env.SMTP_FROM?.trim() || `${APP_NAME} <nebula@localhost>`,
  };
}

export const emailAvailable = () => smtpConfig() !== null;

async function sendEmail(
  target: NotificationTarget,
  message: NotificationMessage,
): Promise<DeliveryResult> {
  const config = smtpConfig();
  if (!config) {
    return { ok: false, message: "Kein SMTP hinterlegt – SMTP_HOST in der .env setzen." };
  }

  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
    });

    const zeilen = [message.body];
    if (message.url) zeilen.push("", message.url);
    zeilen.push("", `— ${APP_NAME}, ${APP_URL}`);

    await transport.sendMail({
      from: config.from,
      to: target.target,
      subject: message.title,
      text: zeilen.join("\n"),
    });

    return { ok: true, message: `An ${target.target} versendet` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Stellt eine Nachricht ueber den Weg des Ziels zu. */
export async function deliver(
  target: NotificationTarget,
  message: NotificationMessage,
): Promise<DeliveryResult> {
  if (target.channel === "EMAIL") return sendEmail(target, message);

  // Webhook und ntfy rufen eine vom Benutzer angegebene Adresse auf.
  try {
    await assertAllowedUrl(target.target);
  } catch (error) {
    if (error instanceof BlockedHostError) return { ok: false, message: error.message };
    throw error;
  }

  return target.channel === "NTFY" ? sendNtfy(target, message) : sendWebhook(target, message);
}
