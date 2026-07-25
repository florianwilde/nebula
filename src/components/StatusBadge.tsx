import type { ProjectStatus } from "@prisma/client";
import { statusOf } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: ProjectStatus;
  size?: "sm" | "md";
}) {
  const meta = statusOf(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset",
        meta.className,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
    >
      <span
        className="accent-dot h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color, color: meta.color }}
      />
      {meta.label}
    </span>
  );
}
