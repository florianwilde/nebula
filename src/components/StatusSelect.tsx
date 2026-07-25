"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { Popover } from "@/components/ui/Popover";
import { STATUS_META, STATUS_ORDER, statusOf } from "@/lib/status";
import { cn } from "@/lib/utils";

interface StatusSelectProps {
  projectId: string;
  status: ProjectStatus;
  /** compact: nur Punkt + Kurzlabel, fuer die Karten im Board. */
  variant?: "compact" | "full";
  onChanged?: (status: ProjectStatus) => void;
}

export function StatusSelect({
  projectId,
  status,
  variant = "full",
  onChanged,
}: StatusSelectProps) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ProjectStatus>(status);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const meta = statusOf(current);

  async function select(next: ProjectStatus) {
    setOpen(false);
    if (next === current) return;

    const previous = current;
    setCurrent(next); // optimistisch
    setSaving(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error(await response.text());
      onChanged?.(next);
      startTransition(() => router.refresh());
    } catch {
      setCurrent(previous); // zurueckrollen
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          // Die Karte im Board ist ein Link – der darf hier nicht ausloesen.
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset transition-all hover:brightness-125",
          meta.className,
          variant === "compact" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {saving || pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span
            className="accent-dot h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: meta.color, color: meta.color }}
          />
        )}
        {variant === "compact" ? meta.short : meta.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      <Popover
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        role="listbox"
        width={264}
      >
        {STATUS_ORDER.map((value) => {
          const option = STATUS_META[value];
          const active = value === current;
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={active}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void select(value);
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                active ? "bg-white/8" : "hover:bg-white/6",
              )}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: option.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm text-slate-100">
                  {option.label}
                  {active ? <Check className="h-3 w-3 text-violet-300" /> : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </Popover>
    </>
  );
}
