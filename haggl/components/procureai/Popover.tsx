"use client";

// Popover primitive ported from the Claude Design handoff
// (yc-hack/project/disclosure.jsx). Anchored trigger that opens a panel;
// click outside to close.

import { useEffect, useRef, useState, type ReactNode } from "react";

function useClickOutside(ref: React.RefObject<HTMLElement>, onOut: () => void) {
  useEffect(() => {
    if (!ref.current) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [ref, onOut]);
}

interface PopoverProps {
  trigger: ReactNode | ((state: { open: boolean }) => ReactNode);
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  align?: "right" | "left";
  width?: number;
  defaultOpen?: boolean;
}

export function Popover({
  trigger,
  children,
  align = "right",
  width = 320,
  defaultOpen = false,
}: PopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        {typeof trigger === "function" ? trigger({ open }) : trigger}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            [align]: 0,
            width,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "var(--shadow-lg)",
            zIndex: 20,
            overflow: "hidden",
            animation: "pa-pop-fade 0.12s ease-out",
          }}
        >
          {typeof children === "function"
            ? children({ close: () => setOpen(false) })
            : children}
        </div>
      )}
    </div>
  );
}
