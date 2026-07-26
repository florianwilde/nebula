"use client";

import { AlignLeft, CalendarClock, GripVertical, Repeat } from "lucide-react";
import type { Task } from "@prisma/client";
import { RECURRENCE_META } from "@/lib/tasks";
import { cn, formatDate } from "@/lib/utils";

/** Faelligkeit einordnen: ueberfaellig, heute, demnaechst. */
function dueTone(due: Date | string | null, done: boolean) {
  if (!due || done) return null;
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { className: "text-rose-300", label: "ueberfaellig" };
  if (days === 0) return { className: "text-amber-300", label: "heute" };
  if (days <= 3) return { className: "text-amber-200/70", label: null };
  return { className: "text-slate-500", label: null };
}

export function TaskCard({
  task,
  onEdit,
  dragHandle,
  overlay = false,
}: {
  task: Task;
  onEdit?: (task: Task) => void;
  dragHandle?: Record<string, unknown>;
  overlay?: boolean;
}) {
  const done = task.status === "DONE";
  const due = dueTone(task.dueDate, done);

  return (
    <article
      className={cn(
        "group rounded-lg border border-white/8 bg-[#0b0d1c] p-2 transition-colors",
        !overlay && "hover:border-white/16",
        overlay && "rotate-2 cursor-grabbing shadow-2xl ring-1 ring-violet-400/40",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-slate-700 transition-colors hover:text-slate-400 active:cursor-grabbing"
          aria-label={`${task.title} verschieben`}
          {...dragHandle}
        >
          <GripVertical className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={() => onEdit?.(task)}
          disabled={!onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={cn(
              "break-words text-xs leading-snug text-slate-200",
              done && "text-slate-500 line-through",
            )}
          >
            {task.title}
          </p>

          {(task.description || task.dueDate || task.recurrence || task.labels.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
              {task.description ? (
                <AlignLeft className="h-2.5 w-2.5 text-slate-600" aria-label="hat Beschreibung" />
              ) : null}

              {task.recurrence ? (
                <span
                  className="inline-flex items-center gap-1 text-slate-500"
                  title={`Wiederholt sich: ${RECURRENCE_META[task.recurrence].label}`}
                >
                  <Repeat className="h-2.5 w-2.5" />
                  {RECURRENCE_META[task.recurrence].short}
                </span>
              ) : null}

              {task.dueDate ? (
                <span className={cn("inline-flex items-center gap-1", due?.className)}>
                  <CalendarClock className="h-2.5 w-2.5" />
                  {due?.label ?? formatDate(task.dueDate)}
                </span>
              ) : null}

              {task.labels.slice(0, 3).map((label) => (
                <span key={label} className="rounded bg-white/6 px-1 py-0.5 text-slate-400">
                  {label}
                </span>
              ))}
            </div>
          )}
        </button>
      </div>
    </article>
  );
}
