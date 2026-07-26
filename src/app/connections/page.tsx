import type { Metadata } from "next";
import { ConnectionsManager } from "@/components/ConnectionsManager";
import { requireUserPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { connectionSafeSelect } from "@/lib/projects";
import type { ConnectionWithCount } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Git-Verbindungen",
  description: "GitHub, GitLab und Gitea verbinden.",
};

export default async function ConnectionsPage() {
  const user = await requireUserPage();

  const connections = await prisma.gitConnection.findMany({
    where: { ownerId: user.id },
    select: { ...connectionSafeSelect, _count: { select: { repositories: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="pt-4">
      <ConnectionsManager connections={connections as unknown as ConnectionWithCount[]} />
    </div>
  );
}
