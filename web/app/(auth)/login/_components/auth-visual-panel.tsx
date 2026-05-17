/**
 * Warm route-map visual - San Diego routing to overseas suppliers.
 * Coordinates mirror pencil-new.pen (Variation B · "B1 · Sign in").
 * Dot centers sit exactly on each arc's endpoint; label x/y are the
 * text box top-left (rendered with a text-before-edge baseline so the
 * pen's top-left coordinates map directly).
 */

const ORIGIN = { cx: 69.5, cy: 309.5, r: 7.5 };
const ORIGIN_LABEL = { content: "San Diego, US", x: 42, y: 326 };

const NODES = [
  { cx: 428.5, cy: 358.5, r: 5.5, label: "Lagos · Yoruba", lx: 441, ly: 348 },
  { cx: 398.5, cy: 498.5, r: 5.5, label: "Accra · Twi", lx: 300, ly: 512 },
  { cx: 359.5, cy: 199.5, r: 5.5, label: "Erode · Hindi", lx: 376, ly: 189 },
];

const ARCS = [
  { d: "M70 310 Q 240 150 430 360", opacity: 0.4 },
  { d: "M70 310 Q 200 340 400 500", opacity: 0.3 },
  { d: "M70 310 Q 215 115 360 200", opacity: 0.35 },
];

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
          viewBox="0 0 560 560"
          className="absolute inset-0 size-full"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
        >
          {ARCS.map((arc, i) => (
            <path
              key={i}
              d={arc.d}
              stroke="var(--clay)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={arc.opacity}
            />
          ))}

          <circle
            cx={ORIGIN.cx}
            cy={ORIGIN.cy}
            r={ORIGIN.r}
            fill="var(--clay)"
          />
          <text
            x={ORIGIN_LABEL.x}
            y={ORIGIN_LABEL.y}
            dominantBaseline="text-before-edge"
            className="font-mono"
            fontSize="12"
            fill="var(--ink-2)"
          >
            {ORIGIN_LABEL.content}
          </text>

          {NODES.map((n) => (
            <g key={n.label}>
              <circle cx={n.cx} cy={n.cy} r={n.r} fill="var(--clay)" />
              <text
                x={n.lx}
                y={n.ly}
                dominantBaseline="text-before-edge"
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
          “It closed eleven supplier deals across Lagos before lunch - and
          every call was in Yoruba.”
        </blockquote>
        <figcaption className="font-mono text-xs text-ink-3">
          Marcus Allen · independent importer
        </figcaption>
      </figure>
    </div>
  );
}
