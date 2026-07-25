import { CircleCheck, CircleDashed, CircleSlash, CircleX, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type CiState = "success" | "failure" | "running" | "pending" | "cancelled";

const META: Record<
  CiState,
  { label: string; short: string; className: string; icon: typeof CircleCheck; spin?: boolean }
> = {
  success: {
    label: "CI erfolgreich",
    short: "CI ok",
    className: "bg-emerald-500/12 text-emerald-200 ring-emerald-400/30",
    icon: CircleCheck,
  },
  failure: {
    label: "CI fehlgeschlagen",
    short: "CI rot",
    className: "bg-rose-500/12 text-rose-200 ring-rose-400/30",
    icon: CircleX,
  },
  running: {
    label: "CI laeuft",
    short: "CI laeuft",
    className: "bg-amber-500/12 text-amber-200 ring-amber-400/30",
    icon: LoaderCircle,
    spin: true,
  },
  pending: {
    label: "CI wartet",
    short: "CI wartet",
    className: "bg-slate-500/12 text-slate-300 ring-slate-400/25",
    icon: CircleDashed,
  },
  cancelled: {
    label: "CI abgebrochen",
    short: "CI abgebrochen",
    className: "bg-slate-500/12 text-slate-400 ring-slate-400/20",
    icon: CircleSlash,
  },
};

export function CiBadge({
  state,
  name,
  url,
  compact = false,
}: {
  state: string | null | undefined;
  name?: string | null;
  url?: string | null;
  compact?: boolean;
}) {
  if (!state || !(state in META)) return null;
  const meta = META[state as CiState];
  const Icon = meta.icon;

  const content = (
    <>
      <Icon className={cn("h-3 w-3 shrink-0", meta.spin && "animate-spin")} />
      {compact ? meta.short : (name ?? meta.label)}
    </>
  );

  const className = cn(
    "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset",
    meta.className,
    compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
  );

  if (url && !compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(className, "transition-all hover:brightness-125")}
        title={meta.label}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={className} title={name ? `${meta.label} · ${name}` : meta.label}>
      {content}
    </span>
  );
}
