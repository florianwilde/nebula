import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { encryptSecret, tokenHint } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { normalizeBaseUrl } from "@/lib/git/http";
import { connectionSafeSelect } from "@/lib/projects";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { BlockedHostError, assertAllowedUrl } from "@/lib/security/ssrf";
import { connectionCreateSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Verbindungen ohne Token-Chiffrat – das verlaesst den Server nie. */
const safeSelect = {
  ...connectionSafeSelect,
  _count: { select: { repositories: true } },
};

export async function GET() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const connections = await prisma.gitConnection.findMany({
    where: { ownerId: auth.user.id },
    select: safeSelect,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ connections });
}

export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `mutate:${clientIp(request)}`,
    LIMITS.mutation.limit,
    LIMITS.mutation.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = connectionCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { name, provider, baseUrl, username, token } = parsed.data;

  // Die Basis-URL wird spaeter serverseitig abgerufen – hier pruefen, damit
  // sie nicht auf interne Dienste oder Metadaten-Endpunkte zeigt.
  try {
    await assertAllowedUrl(normalizeBaseUrl(baseUrl));
  } catch (error) {
    if (error instanceof BlockedHostError) {
      return NextResponse.json(
        { error: error.message, fields: { baseUrl: error.message } },
        { status: 422 },
      );
    }
    throw error;
  }

  const duplicate = await prisma.gitConnection.findFirst({
    where: { name, ownerId: auth.user.id },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error: "Es gibt bereits eine Verbindung mit diesem Namen.",
        fields: { name: "Name bereits vergeben" },
      },
      { status: 409 },
    );
  }

  const connection = await prisma.gitConnection.create({
    data: {
      ownerId: auth.user.id,
      name,
      provider,
      baseUrl: normalizeBaseUrl(baseUrl),
      username: username ?? null,
      tokenCipher: token ? encryptSecret(token) : null,
      tokenHint: token ? tokenHint(token) : null,
    },
    select: safeSelect,
  });

  return NextResponse.json({ connection }, { status: 201 });
}
