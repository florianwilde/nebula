import type { Metadata } from "next";
import { ConnectionsManager } from "@/components/ConnectionsManager";
import { prisma } from "@/lib/db";
import { connectionSafeSelect } from "@/lib/projects";
import type { ConnectionWithCount } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Git-Verbindungen",
  description: "GitHub, GitLab und Gitea mit Nebula verbinden.",
};

export default async function ConnectionsPage() {
  const connections = await prisma.gitConnection.findMany({
    select: { ...connectionSafeSelect, _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="pt-4">
      <ConnectionsManager connections={connections as unknown as ConnectionWithCount[]} />
    </div>
  );
}
