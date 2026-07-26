"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { GitBranch, GripVertical, NotebookPen } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { CiBadge } from "@/components/CiBadge";
import { STATUS_META, STATUS_ORDER, accentOf } from "@/lib/status";
import { cn, truncate } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

/**
 * Statusspalten mit Ziehen und Ablegen.
 *
 * Der Statuswechsel wird sofort angezeigt und erst danach gespeichert;
 * scheitert das Speichern, springt die Karte zurueck. Die Reihenfolge
 * innerhalb einer Spalte ist nicht frei sortierbar – sie folgt der im Board
 * gewaehlten Sortierung, sonst muesste eine Position mitgespeichert werden.
 */
export function KanbanBoard({
  projects,
  showArchived,
}: {
  projects: ProjectListItem[];
  showArchived: boolean;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, ProjectStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Eine Verschiebung, die der Server bestaetigt hat, braucht keine
  // oertliche Ausnahme mehr.
  useEffect(() => {
    setOverrides((current) => {
      const next: Record<string, ProjectStatus> = {};
      for (const [id, status] of Object.entries(current)) {
        const project = projects.find((entry) => entry.id === id);
        if (project && project.status !== status) next[id] = status;
      }
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [projects]);

  const sensors = useSensors(
    // Erst ab ein paar Pixeln Bewegung ziehen – sonst liesse sich die Karte
    // nicht mehr anklicken.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const statusOf = (project: ProjectListItem) => overrides[project.id] ?? project.status;

  const columns = useMemo(() => {
    const visible = STATUS_ORDER.filter(
      (status) => showArchived || status !== "ARCHIVED",
    );
    return visible.map((status) => ({
      status,
      items: projects.filter((project) => statusOf(project) === status),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, overrides, showArchived]);

  const active = activeId ? projects.find((project) => project.id === activeId) : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const id = String(event.active.id);
    const target = event.over?.id ? (String(event.over.id) as ProjectStatus) : null;
    if (!target) return;

    const project = projects.find((entry) => entry.id === id);
    if (!project) return;

    const previous = statusOf(project);
    if (previous === target) return;

    setOverrides((current) => ({ ...current, [id]: target }));

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setOverrides((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToWindowEdges]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => (
          <Column key={column.status} status={column.status} count={column.items.length}>
            {column.items.map((project) => (
              <KanbanCard key={project.id} project={project} />
            ))}
          </Column>
        ))}
      </div>

      {/* Die mitgezogene Karte haengt am Cursor, nicht in der Spalte. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {active ? <KanbanCard project={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  count,
  children,
}: {
  status: ProjectStatus;
  count: number;
  children: React.ReactNode;
}) {
  const meta = STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      // Eindeutiger Anker fuer Tests und Automatisierung.
      data-column={status}
      className={cn(
        "flex w-[17rem] shrink-0 flex-col rounded-2xl border border-white/6 bg-white/2 transition-colors",
        isOver && "border-violet-400/40 bg-violet-500/6",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="accent-dot h-2 w-2 rounded-full"
          style={{ backgroundColor: meta.color, color: meta.color }}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          {meta.label}
        </h3>
        <span className="ml-auto rounded-full bg-white/6 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
          {count}
        </span>
      </header>

      <div className="flex min-h-[7rem] flex-1 flex-col gap-2 px-2 pb-2">
        {children}
        {count === 0 ? (
          <p
            className={cn(
              "rounded-xl border border-dashed border-white/8 px-3 py-6 text-center text-[11px] text-slate-600 transition-colors",
              isOver && "border-violet-400/40 text-violet-200",
            )}
          >
            {isOver ? "Hier ablegen" : "leer"}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function KanbanCard({
  project,
  overlay = false,
}: {
  project: ProjectListItem;
  overlay?: boolean;
}) {
  const accent = accentOf(project.accent);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      className={cn(
        "popover group relative overflow-hidden p-3",
        // Das Original bleibt als blasser Platzhalter stehen.
        isDragging && !overlay && "opacity-30",
        overlay && "rotate-2 cursor-grabbing shadow-2xl ring-1 ring-violet-400/40",
      )}
      style={
        {
          "--accent-from": accent.from,
          "--accent-to": accent.to,
        } as React.CSSProperties
      }
    >
      <span className="accent-bar absolute inset-x-0 top-0 h-[2px] opacity-70" aria-hidden="true" />

      <div className="flex items-start gap-2">
        {/* Nur der Griff zieht – so bleibt der Titel ein normaler Link. */}
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-slate-600 transition-colors hover:text-slate-300 active:cursor-grabbing"
          aria-label={`${project.name} verschieben`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/projects/${project.id}`}
            className="block truncate text-sm font-medium text-slate-100 hover:text-violet-200"
          >
            {project.name}
          </Link>
          {project.summary ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
              {truncate(project.summary, 90)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/6">
        <div
          className="accent-bar h-full rounded-full"
          style={{ width: `${Math.max(2, project.progress)}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
        {/* Auf der schmalen Kanban-Karte nur das fuehrende Repository. */}
        <CiBadge state={project.repositories[0]?.snapshot?.ciState} compact />
        {project.repositories[0]?.snapshot?.defaultBranch ? (
          <span className="inline-flex items-center gap-1 font-mono">
            <GitBranch className="h-3 w-3" />
            {project.repositories[0].snapshot.defaultBranch}
          </span>
        ) : null}
        {project._count.notes > 0 ? (
          <span className="inline-flex items-center gap-1">
            <NotebookPen className="h-3 w-3" />
            {project._count.notes}
          </span>
        ) : null}
        <span className="ml-auto tabular-nums">{project.progress}%</span>
      </div>
    </article>
  );
}
