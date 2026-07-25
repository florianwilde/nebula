import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientForConnection } from "@/lib/git";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Listet Repositories, auf die der hinterlegte Token Zugriff hat. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const query = new URL(request.url).searchParams.get("q") ?? undefined;

  const connection = await prisma.gitConnection.findUnique({ where: { id } });
  if (!connection) {
    return NextResponse.json({ error: "Verbindung nicht gefunden" }, { status: 404 });
  }

  try {
    const repos = await clientForConnection(connection).listRepos(query);
    return NextResponse.json({ repos });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
