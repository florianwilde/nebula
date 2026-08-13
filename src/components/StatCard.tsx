import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  color: string;
  className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, color, className }: StatCardProps) {
  return (
    <div className={cn("glass relative overflow-hidden p-3 sm:p-4", className)}>
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          {/* Umbrechen statt abschneiden: in der zweispaltigen Anordnung auf
              dem Telefon endeten "In Entwicklung" und "Repos verknuepft"
              sonst beide als "In Entwickl…" – zwei Kacheln, die sich nicht
              mehr unterscheiden liessen. */}
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white sm:mt-2 sm:text-3xl">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs leading-tight text-slate-500">{hint}</p> : null}
        </div>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl sm:h-9 sm:w-9"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
