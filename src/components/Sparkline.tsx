import { cn } from "@/lib/utils";

/**
 * Commit-Aktivitaet als kleine Balkenreihe.
 *
 * Bewusst als reines SVG ohne Diagrammbibliothek: es sind dreissig Werte,
 * die Achsen, Legende und Tooltips einer Bibliothek waeren hier nur Ballast.
 */
export function Sparkline({
  values,
  className,
  height = 28,
  label = "Commits",
}: {
  values: number[];
  className?: string;
  height?: number;
  label?: string;
}) {
  if (!values.length) return null;

  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return null;

  const max = Math.max(...values);
  const gap = 1;
  const barWidth = 3;
  const width = values.length * (barWidth + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={`${label} der letzten ${values.length} Tage: insgesamt ${total}`}
    >
      <title>{`${label} der letzten ${values.length} Tage: insgesamt ${total}`}</title>
      {values.map((value, index) => {
        // Auch ein einzelner Commit soll sichtbar sein, daher die Untergrenze.
        const barHeight = value === 0 ? 1.5 : Math.max(3, (value / max) * height);
        return (
          <rect
            key={index}
            x={index * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            className={value === 0 ? "fill-white/10" : "fill-violet-400/80"}
          />
        );
      })}
    </svg>
  );
}
