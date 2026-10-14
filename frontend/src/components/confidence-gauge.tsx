import { formatPercent } from "@/lib/format";
import { confidenceBand } from "@/lib/urgency";
import { cn } from "@/lib/utils";

const SIZE = 112;
const STROKE = 10;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const BAND_COLOR = {
  strong: "var(--signal)",
  fair: "var(--urgency-medium)",
  weak: "var(--urgency-high)",
} as const;

const BAND_LABEL = { strong: "Confident", fair: "Plausible", weak: "Below threshold" } as const;

export function ConfidenceGauge({ value, threshold }: { value: number; threshold: number }) {
  const band = confidenceBand(value, threshold);
  const angle = threshold * 2 * Math.PI - Math.PI / 2;
  const inner = RADIUS - STROKE / 2 - 3;
  const outer = RADIUS + STROKE / 2 + 3;
  return (
    <figure className="flex items-center gap-4">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Confidence ${formatPercent(value)}`}
      >
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth={STROKE} />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - value)}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)" }}
        />
        <line
          x1={CENTER + inner * Math.cos(angle)}
          y1={CENTER + inner * Math.sin(angle)}
          x2={CENTER + outer * Math.cos(angle)}
          y2={CENTER + outer * Math.sin(angle)}
          stroke="var(--foreground)"
          strokeOpacity={0.6}
          strokeWidth={2}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-foreground font-mono text-xl font-semibold"
        >
          {formatPercent(value)}
        </text>
      </svg>
      <figcaption className="text-sm">
        <p className={cn("font-medium", band === "weak" && "text-urgency-high")}>{BAND_LABEL[band]}</p>
        <p className="font-mono text-xs text-muted-foreground">threshold {formatPercent(threshold)}</p>
      </figcaption>
    </figure>
  );
}
