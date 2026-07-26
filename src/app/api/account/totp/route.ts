import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { countUnusedRecoveryCodes, issueRecoveryCodes } from "@/lib/auth/recovery";
import { generateTotpSecret, groupSecret, matchTotp, otpauthUri } from "@/lib/auth/totp";
import { APP_NAME } from "@/lib/config";
import { encryptSecret, tryDecryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Zwei-Faktor-Anmeldung per Einmalkennwort.
 *
 * Die Einrichtung laeuft in zwei Schritten: POST legt einen Schluessel an und
 * zeigt ihn als QR-Code, PUT schaltet ihn nach einem bestaetigten Code scharf.
 * Erst dann fragt die Anmeldung danach. Wer die Einrichtung abbricht oder den
 * QR-Code nie scannt, sperrt sich so nicht aus.
 */

/** Zustand fuer die Anzeige. */
export async function GET() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: { totpEnabledAt: true },
  });

  return NextResponse.json({
    enabled: Boolean(user.totpEnabledAt),
    enabledAt: user.totpEnabledAt,
    recoveryCodesLeft: user.totpEnabledAt
      ? await countUnusedRecoveryCodes(auth.user.id)
      : 0,
  });
}

/** Schritt 1: Schluessel erzeugen und als QR-Code zurueckgeben. */
export async function POST() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: { totpEnabledAt: true, username: true },
  });

  if (user.totpEnabledAt) {
    return jsonError(
      "Die Zwei-Faktor-Anmeldung ist bereits aktiv. Bitte zuerst abschalten.",
      409,
    );
  }

  // Bei jedem Anlauf ein frischer Schluessel: ein halb eingerichteter aus
  // einem frueheren Versuch koennte in einer Authenticator-App liegen, ohne
  // dass hier bekannt waere, in welcher.
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { totpSecretCipher: encryptSecret(secret) },
  });

  const uri = otpauthUri({ secret, account: user.username, issuer: APP_NAME });

  return NextResponse.json({
    // Das Bild als data:-URI, damit die Content-Security-Policy nichts
    // nachladen muss. img-src erlaubt data: bereits.
    qr: await QRCode.toDataURL(uri, { margin: 1, width: 320 }),
    uri,
    /** Zum Abtippen, falls die Kamera nicht mitspielt. */
    secret: groupSecret(secret),
  });
}

const enableSchema = z.object({ code: z.string().min(6).max(10) });

/** Schritt 2: Code bestaetigen, scharfschalten, Wiederherstellungscodes ausgeben. */
export async function PUT(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = enableSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: { totpSecretCipher: true, totpEnabledAt: true },
  });

  if (user.totpEnabledAt) return jsonError("Die Zwei-Faktor-Anmeldung ist bereits aktiv.", 409);

  const secret = tryDecryptSecret(user.totpSecretCipher);
  if (!secret) {
    return jsonError("Es liegt kein Schluessel vor. Bitte die Einrichtung neu starten.", 409);
  }

  const fenster = matchTotp(secret, parsed.data.code);
  if (fenster === null) {
    return jsonError(
      "Der Code stimmt nicht. Geht die Uhr des Geraets richtig?",
      401,
    );
  }

  await prisma.user.update({
    where: { id: auth.user.id },
    // Das Fenster gleich mitverbrennen: der Code, der eben aktiviert hat,
    // soll nicht Sekunden spaeter noch zum Anmelden taugen.
    data: { totpEnabledAt: new Date(), totpLastCounter: fenster },
  });

  return NextResponse.json({
    ok: true,
    // Einmalige Ausgabe: gespeichert wird nur ihr Hash.
    recoveryCodes: await issueRecoveryCodes(auth.user.id),
  });
}

const disableSchema = z.object({ password: z.string().min(1).max(200) });

/** Abschalten. Verlangt das Passwort, nicht nur eine offene Sitzung. */
export async function DELETE(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = disableSchema.safeParse(body.data);
  if (!parsed.success) return jsonError("Bitte das Passwort angeben.", 422);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: { passwordHash: true, totpEnabledAt: true },
  });

  if (!user.totpEnabledAt) return jsonError("Die Zwei-Faktor-Anmeldung ist nicht aktiv.", 409);

  // Ein unbeaufsichtigter Rechner mit offener Sitzung soll den zweiten Faktor
  // nicht im Vorbeigehen entfernen koennen.
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Das Passwort stimmt nicht.", 401);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: auth.user.id },
      data: { totpSecretCipher: null, totpEnabledAt: null, totpLastCounter: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: auth.user.id } }),
    prisma.pendingLogin.deleteMany({ where: { userId: auth.user.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
