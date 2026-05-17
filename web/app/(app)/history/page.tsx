import { History as HistoryIcon } from "lucide-react";
import { relativeTime } from "@/lib/format";

const PAST = [
  {
    title: "Cotton scarves — 1,000 units",
    supplier: "Kente Textiles Co.",
    place: "Kumasi, Ghana · Twi",
    price: "$2.85 / unit",
    closedAt: new Date(Date.now() - 8 * 864e5).toISOString(),
  },
  {
    title: "Industrial turmeric — 800 kg",
    supplier: "Mehta Spice Traders",
    place: "Erode, India · Hindi",
    price: "$3.10 / kg",
    closedAt: new Date(Date.now() - 21 * 864e5).toISOString(),
  },
];

export default function HistoryPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-8 py-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">History</h1>
          <p className="font-mono text-xs text-ink-3">Closed negotiations</p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {PAST.map((row) => (
            <div
              key={row.title}
              className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-surface-2">
                <HistoryIcon className="size-4 text-ink-3" />
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-ink">{row.title}</p>
                <p className="text-xs text-ink-2">
                  {row.supplier} · {row.place}
                </p>
              </div>
              <span className="font-display text-lg font-semibold text-ink tabular">
                {row.price}
              </span>
              <span className="w-28 text-right font-mono text-xs text-ink-3">
                Closed {relativeTime(row.closedAt)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
