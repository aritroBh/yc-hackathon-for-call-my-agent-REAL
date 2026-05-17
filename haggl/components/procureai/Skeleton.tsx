// Skeleton placeholder — shows while a component has no data yet / is not
// ready to render. No demo data; purely structural shimmer.

import type { CSSProperties } from "react";

export function Skel({
  w = "100%",
  h = 12,
  r = 6,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className="pa-skel"
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  );
}

export function SkelCircle({ size = 24, style }: { size?: number; style?: CSSProperties }) {
  return <Skel w={size} h={size} r={size / 2} style={style} />;
}
