export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1 w-7 rounded-full transition-colors ${
            i < current
              ? "bg-ink-3"
              : i === current
                ? "bg-clay"
                : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}
