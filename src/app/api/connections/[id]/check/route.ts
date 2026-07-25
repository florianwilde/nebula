import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientForConnection } from "@/lib/git";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Testet Erreichbarkeit und Token einer Verbindung und merkt sich das Ergebnis. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  const connection = await prisma.gitConnection.findUnique({ where: { id } });
  if (!connection) {
    return NextResponse.json({ error: "Verbindung nicht gefunden" }, { status: 404 });
  }

  const result = await clientForConnection(connection).check();

  await prisma.gitConnection.update({
    where: { id },
    data: {
      lastCheckedAt: new Date(),
      lastCheckOk: result.ok,
      lastCheckMessage: result.message,
      username: result.user ?? connection.username,
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
