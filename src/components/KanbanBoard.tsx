"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GitBranch, GripVertical, Loader2, NotebookPen } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { CiBadge } from "@/components/CiBadge";
import { STATUS_META, STATUS_ORDER, accentOf } from "@/lib/status";
import { cn, truncate } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

type Columns = Record<ProjectStatus, ProjectListItem[]>;

/**
 * Statusspalten mit Ziehen, Ablegen und freier Reihenfolge.
 *
 * Die Reihenfolge innerhalb einer Spalte wird als Position am Projekt
 * gespeichert – wie beim Aufgabenbrett. Deshalb richtet sich das Brett auch
 * nicht nach der im Kopf gewaehlten Sortierung: die gilt fuer Raster und
 * Gruppen, hier zaehlt die Anordnung von Hand.
 *
 * Verschieben wird sofort angezeigt und erst danach gespeichert; scheitert
 * das Speichern, springt alles auf den Serverstand zurueck.
 */
export function KanbanBoard({
  projects,
  showArchived,
  selection,
  onToggleSelect,
}: {
  projects: ProjectListItem[];
  showArchived: boolean;
  selection: Set<string>;
  onToggleSelect: (id: string, selected: boolean) => void;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sichtbar = useMemo(
    () => STATUS_ORDER.filter((status) => showArchived || status !== "ARCHIVED"),
    [showArchived],
  );

  const group = useMemo(
    () => (list: ProjectListItem[]): Columns => {
      const leer = Object.fromEntries(
        STATUS_ORDER.map((status) => [status, [] as ProjectListItem[]]),
      ) as Columns;
      for (const project of list) leer[project.status].push(project);
      for (const status of STATUS_ORDER) {
        // Bei gleicher Position bleibt es bei der Reihenfolge, in der die
        // Liste kam – das ist die im Kopf gewaehlte Sortierung.
        leer[status].sort((a, b) => a.position - b.position);
      }
      return leer;
    },
    [],
  );

  const [columns, setColumns] = useState<Columns>(() => group(projects));

  // Waehrend eines Zuges nicht dazwischenfunken: der Serverstand ist dann
  // noch der alte und wuerde die Karte zurueckspringen lassen.
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setColumns(group(projects));
  }, [projects, group]);

  const sensors = useSensors(
    // Erst ab ein paar Pixeln Bewegung ziehen – sonst liesse sich die Karte
    // nicht mehr anklicken.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const active = activeId
    ? Object.values(columns).flat().find((project) => project.id === activeId) ?? null
    : null;

  /** In welcher Spalte steckt diese Kennung – oder ist sie selbst eine? */
  function containerOf(key: string): ProjectStatus | null {
    if ((STATUS_ORDER as string[]).includes(key)) return key as ProjectStatus;
    return (
      STATUS_ORDER.find((status) => columns[status].some((project) => project.id === key)) ?? null
    );
  }

  function onDragStart(event: DragStartEvent) {
    dragging.current = true;
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;
    if (!overKey) return;

    const from = containerOf(activeKey);
    const to = containerOf(overKey);
    if (!from || !to || from === to) return;

    setColumns((current) => {
      const moved = current[from].find((project) => project.id === activeKey);
      if (!moved) return current;

      const zielIndex = current[to].findIndex((project) => project.id === overKey);
      const einfuegenBei = zielIndex >= 0 ? zielIndex : current[to].length;

      return {
        ...current,
        [from]: current[from].filter((project) => project.id !== activeKey),
        [to]: [
          ...current[to].slice(0, einfuegenBei),
          { ...moved, status: to },
          ...current[to].slice(einfuegenBei),
        ],
      };
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;

    let next = columns;

    if (overKey) {
      const container = containerOf(activeKey);
      const ueber = containerOf(overKey);
      if (container && container === ueber) {
        const list = columns[container];
        const alt = list.findIndex((project) => project.id === activeKey);
        const neu = list.findIndex((project) => project.id === overKey);
        if (alt >= 0 && neu >= 0 && alt !== neu) {
          const sortiert = [...list];
          const [moved] = sortiert.splice(alt, 1);
          sortiert.splice(neu, 0, moved);
          next = { ...columns, [container]: sortiert };
          setColumns(next);
        }
      }
    }

    setActiveId(null);
    dragging.current = false;
    await persist(next);
  }

  async function persist(next: Columns) {
    setSaving(true);
    try {
      const response = await fetch("/api/projects/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns: Object.fromEntries(
            sichtbar.map((status) => [status, next[status].map((project) => project.id)]),
          ),
        }),
      });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      // Zurueck auf den Serverstand – die Bewegung war dann nur optisch.
      setColumns(group(projects));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      modifiers={[restrictToWindowEdges]}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        dragging.current = false;
        setColumns(group(projects));
      }}
    >
      {saving ? (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reihenfolge wird gespeichert…
        </p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {sichtbar.map((status) => (
          <Column key={status} status={status} count={columns[status].length}>
            <SortableContext
              items={columns[status].map((project) => project.id)}
              strategy={verticalListSortingStrategy}
            >
              {columns[status].map((project) => (
                <KanbanCard
                  key={project.id}
                  project={project}
                  selected={selection.has(project.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </SortableContext>
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
  selected = false,
  onToggleSelect,
}: {
  project: ProjectListItem;
  overlay?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, selected: boolean) => void;
}) {
  const accent = accentOf(project.accent);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      style={
        {
          "--accent-from": accent.from,
          "--accent-to": accent.to,
          ...(overlay ? {} : { transform: CSS.Transform.toString(transform), transition }),
        } as React.CSSProperties
      }
      className={cn(
        "popover group relative overflow-hidden p-3",
        // Das Original bleibt als blasser Platzhalter stehen.
        isDragging && !overlay && "opacity-30",
        overlay && "rotate-2 cursor-grabbing shadow-2xl ring-1 ring-violet-400/40",
        selected && "ring-1 ring-violet-400/60",
      )}
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

        {onToggleSelect ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggleSelect(project.id, event.target.checked)}
            className="mt-1 h-3.5 w-3.5 shrink-0 accent-violet-500"
            aria-label={`${project.name} auswaehlen`}
          />
        ) : null}

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
