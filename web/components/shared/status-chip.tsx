import type { CallStatus, NegotiationPhase } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

type Variant = "default" | "neutral" | "green" | "amber" | "red";

export function statusLabel(
  status: CallStatus,
  phase: NegotiationPhase,
  isDeal: boolean,
): { label: string; variant: Variant } {
  switch (status) {
    case "pending":
    case "queued":
      return { label: "Queued", variant: "neutral" };
    case "ringing":
      return { label: "Ringing…", variant: "neutral" };
    case "in-progress":
      return {
        label: phase === "closing" ? "Closing" : "Negotiating",
        variant: "amber",
      };
    case "completed":
      return isDeal
        ? { label: "Deal reached", variant: "green" }
        : { label: "No deal", variant: "red" };
    case "capped":
      return { label: "Over cap", variant: "red" };
    case "failed":
    case "no-answer":
    case "busy":
    case "rejected":
    case "timeout":
      return { label: "Unreachable", variant: "red" };
    default:
      return { label: status, variant: "neutral" };
  }
}

export function StatusChip({
  status,
  phase,
  isDeal,
}: {
  status: CallStatus;
  phase: NegotiationPhase;
  isDeal: boolean;
}) {
  const { label, variant } = statusLabel(status, phase, isDeal);
  const dotColor =
    variant === "green"
      ? "bg-status-green"
      : variant === "amber"
        ? "bg-status-amber"
        : variant === "red"
          ? "bg-status-red"
          : "bg-ink-3";

  return (
    <Badge variant={variant}>
      <span className={`size-1.5 rounded-full ${dotColor}`} />
      {label}
    </Badge>
  );
}
