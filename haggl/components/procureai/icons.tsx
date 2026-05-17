// Icon set ported from the Claude Design handoff (yc-hack/project/shared.jsx).
// Each icon takes `size` (px), optional `color` (applied via currentColor),
// plus className/style/title passthrough.

import type { CSSProperties, ReactNode } from "react";

export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

function svg(
  { size = 16, color, className, style, title }: IconProps,
  attrs: Record<string, string>,
  children: ReactNode,
) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      style={color ? { color, ...style } : style}
      {...attrs}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: "1.5" };
const fill = { fill: "currentColor" };

export const Icon = {
  Home: (p: IconProps) =>
    svg(p, stroke, <path d="M2.5 7L8 2.5l5.5 4.5v6a.5.5 0 0 1-.5.5h-3v-4h-4v4H3a.5.5 0 0 1-.5-.5V7Z" strokeLinejoin="round" />),
  Phone: (p: IconProps) =>
    svg(p, stroke, <path d="M3.5 2.5h2l1.2 3-1.5 1c.7 1.7 1.9 2.9 3.6 3.6l1-1.5 3 1.2v2c0 .6-.4 1-1 1A9 9 0 0 1 2.5 3.5c0-.6.4-1 1-1Z" strokeLinejoin="round" />),
  Sparkle: (p: IconProps) =>
    svg(p, stroke, <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2" />),
  Inbox: (p: IconProps) =>
    svg(p, stroke, <path d="M2 9l1.5-5.5h9L14 9v3.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V9Zm0 0h3.5l.7 1.5h3.6L10.5 9H14" />),
  Search: (p: IconProps) =>
    svg(p, stroke, <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L13.5 13.5" /></>),
  Users: (p: IconProps) =>
    svg(p, stroke, <><circle cx="6" cy="6" r="2.5" /><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M10 4a2.3 2.3 0 0 1 0 4.5M11 9a3.5 3.5 0 0 1 3 3.5" /></>),
  Cog: (p: IconProps) =>
    svg(p, stroke, <><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4" /></>),
  Plus: (p: IconProps) =>
    svg(p, { ...stroke, strokeWidth: "1.6" }, <path d="M8 3v10M3 8h10" />),
  ArrowRight: (p: IconProps) =>
    svg(p, stroke, <path d="M3 8h10M9 4l4 4-4 4" />),
  Check: (p: IconProps) =>
    svg(p, { ...stroke, strokeWidth: "1.8" }, <path d="M3 8.5l3 3 7-7" />),
  CheckCircle: (p: IconProps) =>
    svg(p, stroke, <><circle cx="8" cy="8" r="6.5" /><path d="M5 8.3l2 2 4-4.5" strokeWidth="1.6" /></>),
  X: (p: IconProps) =>
    svg(p, { ...stroke, strokeWidth: "1.6" }, <path d="M4 4l8 8M12 4l-8 8" />),
  Dot: (p: IconProps) =>
    svg(p, fill, <circle cx="8" cy="8" r="3" />),
  Mic: (p: IconProps) =>
    svg(p, stroke, <><rect x="6" y="2" width="4" height="8" rx="2" /><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12.5v2" /></>),
  PhoneOff: (p: IconProps) =>
    svg(p, stroke, <><path d="M3 9.5C5 7.5 11 7.5 13 9.5l-1.2 1.2a1 1 0 0 1-1.3.1l-1-.7a1 1 0 0 1-.4-1V7.7a8 8 0 0 0-2.2 0v1.4a1 1 0 0 1-.4 1l-1 .7a1 1 0 0 1-1.3-.1L3 9.5Z" /><path d="M2 2l12 12" strokeLinecap="round" /></>),
  Globe: (p: IconProps) =>
    svg(p, stroke, <><circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2.2 2 11 0 13M8 1.5c-2 2.2-2 11 0 13" /></>),
  Calendar: (p: IconProps) =>
    svg(p, stroke, <><rect x="2" y="3.5" width="12" height="10" rx="1.5" /><path d="M2 6.5h12M5.5 2.5v2M10.5 2.5v2" /></>),
  TrendDown: (p: IconProps) =>
    svg(p, stroke, <path d="M2 4l5 5 3-3 4 4M14 10v3h-3" strokeLinejoin="round" />),
  TrendUp: (p: IconProps) =>
    svg(p, stroke, <path d="M2 12l5-5 3 3 4-4M14 6V3h-3" strokeLinejoin="round" />),
  Spinner: (p: IconProps) =>
    svg(p, { ...stroke, strokeWidth: "1.8" }, <>
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite" />
      </path>
      <circle cx="8" cy="8" r="6.5" opacity="0.18" />
    </>),
  Quote: (p: IconProps) =>
    svg(p, fill, <path d="M3 11c0-2.5 1.5-4.5 4-5.5l.5 1c-1.5.7-2.5 1.7-2.8 3H6a1.5 1.5 0 0 1 0 3H4a1 1 0 0 1-1-1Zm6 0c0-2.5 1.5-4.5 4-5.5l.5 1c-1.5.7-2.5 1.7-2.8 3H12a1.5 1.5 0 0 1 0 3h-2a1 1 0 0 1-1-1Z" />),
  Star: (p: IconProps) =>
    svg(p, fill, <path d="M8 1.5l2 4.5 5 .5-3.7 3.4 1.1 5L8 12.5l-4.4 2.4 1.1-5L1 6.5l5-.5L8 1.5Z" />),
  Chevron: (p: IconProps) =>
    svg(p, stroke, <path d="M6 4l4 4-4 4" />),
};

export type IconComponent = (p: IconProps) => ReactNode;
