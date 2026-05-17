"use client";

import { useState } from "react";

export interface RfqFormData {
  title: string;
  description: string;
  target_price: string;
  floor_price: string;
  currency: string;
  deadline: string;
  aggressiveness: "low" | "medium" | "high" | "urgent";
  priority: "cost_savings" | "speed" | "quality" | "relationship" | "balanced";
  items: { sku: string; description: string; quantity: string; unit: string; target_unit_price: string }[];
}

const EMPTY_FORM: RfqFormData = {
  title: "",
  description: "",
  target_price: "",
  floor_price: "",
  currency: "USD",
  deadline: "",
  aggressiveness: "medium",
  priority: "balanced",
  items: [{ sku: "", description: "", quantity: "1", unit: "piece", target_unit_price: "" }],
};

const AGGRESSIVENESS_DESC: Record<string, string> = {
  low: "Collaborative — prioritize long-term partnership",
  medium: "Balanced — professional and direct",
  high: "Assertive — drive for best price",
  urgent: "Expedited — deadline-driven, minimal negotiation",
};

const PRIORITY_DESC: Record<string, string> = {
  cost_savings: "Price minimization — push for lowest possible pricing",
  speed: "Fast delivery — prioritize quick turnaround",
  quality: "Quality first — never compromise on specs",
  relationship: "Long-term partnership — build supplier trust",
  balanced: "Balanced — equal weight across all dimensions",
};

interface Props {
  onSubmit: (data: RfqFormData) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

export default function RFQWizard({ onSubmit, onCancel, submitting }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<RfqFormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof RfqFormData>(key: K, val: RfqFormData[K]) => setForm((f) => ({ ...f, [key]: val }));

  const addItem = () => setForm((f) => ({
    ...f,
    items: [...f.items, { sku: "", description: "", quantity: "1", unit: "piece", target_unit_price: "" }],
  }));
  const removeItem = (idx: number) => setForm((f) => ({
    ...f,
    items: f.items.filter((_, i) => i !== idx),
  }));
  const updateItem = (idx: number, field: string, val: string) => setForm((f) => ({
    ...f,
    items: f.items.map((item, i) => (i === idx ? { ...item, [field]: val } : item)),
  }));

  const validate = (): string | null => {
    if (!form.title.trim()) return "Title is required";
    if (!form.description.trim()) return "Description is required";
    if (form.items.some((i) => !i.description.trim())) return "All items need a description";
    if (form.items.some((i) => !i.quantity || Number(i.quantity) < 1)) return "All items need a valid quantity";
    return null;
  };

  const handleNext = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      await onSubmit(form);
    } catch (e: any) {
      setError(e.message || "Submission failed");
    }
  };

  const steps = ["Details", "Items", "Strategy", "Review"];

  const tabs = (
    <div className="flex gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s} className={`flex-1 text-center text-xs py-2 rounded transition-colors ${
          i === step ? "bg-cyan-900/30 text-cyan-300 border border-cyan-500/30" :
          i < step ? "bg-emerald-900/20 text-emerald-400" :
          "bg-slate-800/50 text-slate-600"
        }`}>
          <span className="font-mono mr-1">{i + 1}</span>
          {s}
        </div>
      ))}
    </div>
  );

  const inputClass = "w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider";
  const selectClass = inputClass + " appearance-none cursor-pointer";

  return (
    <div className="max-w-2xl mx-auto">
      {tabs}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>RFQ Title</label>
            <input className={inputClass} placeholder="Steel Pipe Procurement Q2" value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass + " resize-none"} rows={3} placeholder="Detailed description of procurement needs..." value={form.description} onChange={(e) => update("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Target Price</label>
              <input className={inputClass} type="number" placeholder="50000" value={form.target_price} onChange={(e) => update("target_price", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Floor Price</label>
              <input className={inputClass} type="number" placeholder="42000" value={form.floor_price} onChange={(e) => update("floor_price", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select className={selectClass} value={form.currency} onChange={(e) => update("currency", e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="INR">INR</option>
                <option value="GBP">GBP</option>
                <option value="CNY">CNY</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Deadline</label>
            <input className={inputClass} type="datetime-local" value={form.deadline} onChange={(e) => update("deadline", e.target.value)} />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleNext} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors">Next</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={labelClass}>Line Items ({form.items.length})</span>
            <button onClick={addItem} className="text-[10px] font-medium text-cyan-400 hover:text-cyan-300 uppercase tracking-wider">+ Add Item</button>
          </div>
          {form.items.map((item, idx) => (
            <div key={idx} className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                {form.items.length > 1 && (
                  <button onClick={() => removeItem(idx)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} placeholder="SKU" value={item.sku} onChange={(e) => updateItem(idx, "sku", e.target.value)} />
                <input className={inputClass} placeholder="Unit" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} />
                <input className={inputClass} type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} />
              </div>
              <input className={inputClass} placeholder="Description (e.g. 2in Schedule 40 Steel Pipe)" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
              <input className={inputClass} type="number" placeholder="Target unit price ($)" value={item.target_unit_price} onChange={(e) => updateItem(idx, "target_unit_price", e.target.value)} />
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(0)} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors">Back</button>
            <button onClick={handleNext} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors">Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label className={labelClass}>Negotiation Style</label>
            <div className="grid grid-cols-2 gap-2">
              {["low", "medium", "high", "urgent"].map((a) => (
                <button
                  key={a}
                  onClick={() => update("aggressiveness", a as any)}
                  className={`text-left p-3 rounded-lg border text-xs transition-all ${
                    form.aggressiveness === a
                      ? "border-cyan-500/50 bg-cyan-900/20 text-cyan-200"
                      : "border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-500/50"
                  }`}
                >
                  <span className="font-semibold capitalize block mb-1">{a}</span>
                  <span className="text-[10px] opacity-70">{AGGRESSIVENESS_DESC[a]}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(PRIORITY_DESC).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => update("priority", k as any)}
                  className={`text-left p-3 rounded-lg border text-xs transition-all ${
                    form.priority === k
                      ? "border-cyan-500/50 bg-cyan-900/20 text-cyan-200"
                      : "border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-500/50"
                  }`}
                >
                  <span className="font-semibold capitalize block mb-0.5">{k.replace("_", " ")}</span>
                  <span className="text-[10px] opacity-70">{v}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors">Back</button>
            <button onClick={handleNext} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors">Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">{form.title || "(untitled)"}</h3>
            <p className="text-xs text-slate-400">{form.description || "(no description)"}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-1">
              <span>Target: <span className="text-slate-300 font-mono">{form.target_price ? `$${Number(form.target_price).toLocaleString()}` : "—"}</span></span>
              <span>Floor: <span className="text-slate-300 font-mono">{form.floor_price ? `$${Number(form.floor_price).toLocaleString()}` : "—"}</span></span>
              <span>Style: <span className="text-slate-300 capitalize">{form.aggressiveness}</span></span>
              <span>Priority: <span className="text-slate-300 capitalize">{form.priority.replace("_", " ")}</span></span>
            </div>
            <div className="pt-1">
              <span className="text-[10px] text-slate-500">{form.items.length} item(s):</span>
              <div className="mt-1 space-y-1">
                {form.items.map((i, idx) => (
                  <div key={idx} className="text-[11px] text-slate-400 font-mono">
                    {i.quantity} {i.unit} — {i.description}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors">Back</button>
            <div className="flex gap-2">
              {onCancel && (
                <button onClick={onCancel} className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create RFQ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
