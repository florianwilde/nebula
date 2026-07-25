import { PrismaClient, ProjectStatus } from "@prisma/client";

const prisma = new PrismaClient();

interface SampleNote {
  title?: string | null;
  content: string;
  pinned?: boolean;
}

interface SampleProject {
  name: string;
  slug: string;
  summary: string;
  description: string;
  status: ProjectStatus;
  priority: number;
  progress: number;
  accent: string;
  tags: string[];
  favorite: boolean;
  notes: SampleNote[];
}

/**
 * Legt ein paar Beispielprojekte an, damit das Dashboard nach dem ersten
 * Start nicht leer ist. Idempotent: bereits vorhandene Slugs werden
 * uebersprungen.
 */
async function main() {
  const samples: SampleProject[] = [
    {
      name: "Nebula",
      slug: "nebula",
      summary: "Dieses Dashboard – Uebersicht ueber alle Vibe-Coding Projekte.",
      description:
        "Meta: Nebula verwaltet sich selbst. Notizen, Status und Git-Infos an einem Ort.",
      status: ProjectStatus.IN_DEVELOPMENT,
      priority: 3,
      progress: 65,
      accent: "violet",
      tags: ["next.js", "prisma", "dashboard"],
      favorite: true,
      notes: [
        {
          title: "Naechste Schritte",
          content:
            "- Kanban-Ansicht ergaenzen\n- Webhook-Endpoint fuer Push-Events\n- Export als Markdown",
          pinned: true,
        },
      ],
    },
    {
      name: "Synthwave CLI",
      slug: "synthwave-cli",
      summary: "Terminal-Tool, das Projektgeruest inkl. CI in Sekunden erzeugt.",
      description:
        "Idee: ein `npx synthwave init` das Repo, Lint, Tests, Container und Pipeline vorkonfiguriert.",
      status: ProjectStatus.PLANNING,
      priority: 2,
      progress: 15,
      accent: "cyan",
      tags: ["cli", "typescript", "dx"],
      favorite: false,
      notes: [
        {
          title: null,
          content: "Konkurrenz pruefen: create-t3-app, degit, plop.",
          pinned: false,
        },
      ],
    },
    {
      name: "Pixelgarten",
      slug: "pixelgarten",
      summary: "Browser-Spiel: ein Garten, der aus Commit-Aktivitaet waechst.",
      description:
        "Rohe Idee. Jeder Commit pflanzt eine Pflanze, Streaks lassen sie bluehen.",
      status: ProjectStatus.IDEA,
      priority: 1,
      progress: 0,
      accent: "emerald",
      tags: ["spiel", "canvas", "fun"],
      favorite: false,
      notes: [],
    },
  ];

  for (const sample of samples) {
    const existing = await prisma.project.findUnique({
      where: { slug: sample.slug },
    });
    if (existing) {
      console.log(`  · uebersprungen (existiert): ${sample.slug}`);
      continue;
    }

    const { notes, ...project } = sample;
    await prisma.project.create({
      data: {
        ...project,
        notes: notes.length ? { create: notes } : undefined,
      },
    });
    console.log(`  ✓ angelegt: ${sample.slug}`);
  }
}

main()
  .then(async () => {
    console.log("Seed abgeschlossen.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed fehlgeschlagen:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
