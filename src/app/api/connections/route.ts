import { NextResponse } from "next/server";
import { encryptSecret, tokenHint } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { normalizeBaseUrl } from "@/lib/git/http";
import { connectionSafeSelect } from "@/lib/projects";
import { connectionCreateSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Verbindungen ohne Token-Chiffrat – das verlaesst den Server nie. */
const safeSelect = {
  ...connectionSafeSelect,
  _count: { select: { projects: true } },
};

export async function GET() {
  const connections = await prisma.gitConnection.findMany({
    select: safeSelect,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ connections });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const parsed = connectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { name, provider, baseUrl, username, token } = parsed.data;

  const duplicate = await prisma.gitConnection.findUnique({ where: { name } });
  if (duplicate) {
    return NextResponse.json(
      { error: "Es gibt bereits eine Verbindung mit diesem Namen.", fields: { name: "Name bereits vergeben" } },
      { status: 409 },
    );
  }

  const connection = await prisma.gitConnection.create({
    data: {
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
