const NODES = [
  { cx: 423, cy: 353, label: "Lagos · Yoruba", lx: 441, ly: 348 },
  { cx: 393, cy: 493, label: "Accra · Twi", lx: 300, ly: 512, anchor: "end" as const },
  { cx: 354, cy: 200, label: "Erode · Hindi", lx: 376, ly: 195 },
];

const ARCS = [
  "M70 250 Q 240 90 430 300",
  "M70 250 Q 200 280 400 440",
  "M70 250 Q 215 55 360 140",
];

/** Warm route-map visual — San Diego routing to overseas suppliers. */
export function AuthVisualPanel() {
  return (
    <div className="relative hidden flex-col overflow-hidden bg-surface-2 p-14 lg:flex">
      <div className="flex items-center gap-2">
        <span className="font-display text-[22px] font-semibold text-ink">
          haggl
        </span>
        <span className="size-[7px] rounded-full bg-clay" />
      </div>

      <div className="relative flex-1">
        <svg
          viewBox="0 0 488 560"
          className="absolute inset-0 size-full"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
        >
          {ARCS.map((d, i) => (
            <path
              key={i}
              d={d}
              stroke="var(--clay)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={i === 0 ? 0.42 : 0.32}
            />
          ))}
          <circle cx="70" cy="250" r="7.5" fill="var(--clay)" />
          <text
            x="50"
            y="278"
            className="font-mono"
            fontSize="12"
            fill="var(--ink-2)"
          >
            San Diego, US
          </text>
          {NODES.map((n) => (
            <g key={n.label}>
              <circle cx={n.cx} cy={n.cy} r="5.5" fill="var(--clay)" />
              <text
                x={n.lx}
                y={n.ly}
                textAnchor={n.anchor ?? "start"}
                className="font-mono"
                fontSize="12"
                fill="var(--ink-2)"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <figure className="flex flex-col gap-3">
        <blockquote className="font-display text-[22px] italic leading-snug text-ink">
          “It closed eleven supplier deals across Lagos before lunch — and
          every call was in Yoruba.”
        </blockquote>
        <figcaption className="font-mono text-xs text-ink-3">
          Marcus Allen · independent importer
        </figcaption>
      </figure>
    </div>
  );
}
