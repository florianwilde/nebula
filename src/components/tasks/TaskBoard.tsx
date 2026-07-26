"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { CheckSquare, Loader2, Plus } from "lucide-react";
import type { Task, TaskStatus } from "@prisma/client";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Columns = Record<TaskStatus, Task[]>;

function group(tasks: Task[]): Columns {
  const columns = { TODO: [], DOING: [], BLOCKED: [], DONE: [] } as Columns;
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    columns[task.status].push(task);
  }
  return columns;
}

/**
 * Aufgabenbrett eines Projekts.
 *
 * Anders als beim Projektbrett ist die Reihenfolge innerhalb einer Spalte
 * hier bedeutsam, deshalb @dnd-kit/sortable statt einfacher Ablageflaechen.
 * Waehrend des Ziehens fuehrt der oertliche Zustand, danach wird die neue
 * Ordnung als Ganzes gespeichert: je Spalte die vollstaendige Liste. Das ist
 * wiederholbar und kommt ohne Nachrechnen von Positionen im Browser aus.
 */
export function TaskBoard({
  projectId,
  tasks,
  progressFromTasks,
}: {
  projectId: string;
  tasks: Task[];
  progressFromTasks: boolean;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<Columns>(() => group(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const dragging = useRef(false);

  // Serverstand uebernehmen, solange nicht gerade gezogen wird – sonst
  // wuerde die Karte mitten in der Bewegung zurueckspringen.
  useEffect(() => {
    if (!dragging.current) setColumns(group(tasks));
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const allTasks = useMemo(() => Object.values(columns).flat(), [columns]);
  const active = activeId ? allTasks.find((task) => task.id === activeId) ?? null : null;
  const total = allTasks.length;
  const done = columns.DONE.length;

  function containerOf(id: string): TaskStatus | null {
    if (TASK_STATUS_ORDER.includes(id as TaskStatus)) return id as TaskStatus;
    for (const status of TASK_STATUS_ORDER) {
      if (columns[status].some((task) => task.id === id)) return status;
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    dragging.current = true;
    setActiveId(String(event.active.id));
  }

  /** Wechsel der Spalte passiert schon beim Darueberziehen, nicht erst beim Ablegen. */
  function onDragOver(event: DragOverEvent) {
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;
    if (!overKey) return;

    const from = containerOf(activeKey);
    const to = containerOf(overKey);
    if (!from || !to || from === to) return;

    setColumns((current) => {
      const moved = current[from].find((task) => task.id === activeKey);
      if (!moved) return current;

      const targetIndex = current[to].findIndex((task) => task.id === overKey);
      const insertAt = targetIndex >= 0 ? targetIndex : current[to].length;

      return {
        ...current,
        [from]: current[from].filter((task) => task.id !== activeKey),
        [to]: [
          ...current[to].slice(0, insertAt),
          { ...moved, status: to },
          ...current[to].slice(insertAt),
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
      const overContainer = containerOf(overKey);
      if (container && container === overContainer) {
        const list = columns[container];
        const oldIndex = list.findIndex((task) => task.id === activeKey);
        const newIndex = list.findIndex((task) => task.id === overKey);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          const reordered = [...list];
          const [moved] = reordered.splice(oldIndex, 1);
          reordered.splice(newIndex, 0, moved);
          next = { ...columns, [container]: reordered };
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
      const payload = {
        columns: Object.fromEntries(
          TASK_STATUS_ORDER.map((status) => [status, next[status].map((task) => task.id)]),
        ),
      };
      const response = await fetch(`/api/projects/${projectId}/tasks/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      // Zurueck auf den Serverstand – die Bewegung war dann nur optisch.
      setColumns(group(tasks));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300">
            <CheckSquare className="h-4 w-4" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-200">
              Aufgaben
              {total > 0 ? (
                <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
                  {done}/{total}
                </span>
              ) : null}
              {saving ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" /> : null}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {progressFromTasks
                ? "Der Fortschritt des Projekts folgt diesen Aufgaben."
                : "Ziehen zum Verschieben und Sortieren."}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setCreatingIn("TODO")}
        >
          <Plus className="h-3.5 w-3.5" />
          Aufgabe
        </button>
      </div>

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
          setColumns(group(tasks));
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUS_ORDER.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              tasks={columns[status]}
              onAdd={() => setCreatingIn(status)}
              onEdit={setEditing}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {active ? <TaskCard task={active} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        open={creatingIn !== null || editing !== null}
        projectId={projectId}
        task={editing}
        initialStatus={creatingIn ?? "TODO"}
        onClose={() => {
          setCreatingIn(null);
          setEditing(null);
        }}
      />
    </section>
  );
}

function TaskColumn({
  status,
  tasks,
  onAdd,
  onEdit,
}: {
  status: TaskStatus;
  tasks: Task[];
  onAdd: () => void;
  onEdit: (task: Task) => void;
}) {
  const meta = TASK_STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      data-task-column={status}
      className={cn(
        "flex min-h-[8rem] flex-col rounded-xl border border-white/6 bg-black/20 p-2 transition-colors",
        isOver && "border-violet-400/40 bg-violet-500/6",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: meta.color }}
          aria-hidden="true"
        />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {meta.label}
        </h3>
        <span className="ml-auto text-[10px] tabular-nums text-slate-600">{tasks.length}</span>
      </div>

      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          {tasks.map((task) => (
            <SortableTask key={task.id} task={task} onEdit={onEdit} />
          ))}
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/8 px-2 py-4 text-center text-[10px] text-slate-600">
              {isOver ? "Hier ablegen" : "leer"}
            </p>
          ) : null}
        </div>
      </SortableContext>

      <button
        type="button"
        onClick={onAdd}
        className="mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-300"
      >
        <Plus className="h-3 w-3" />
        hinzufuegen
      </button>
    </div>
  );
}

function SortableTask({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-30")}
    >
      <TaskCard task={task} onEdit={onEdit} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}
