"use client";

import { useState, useRef } from "react";

interface ParsedRow {
  row: number;
  name: string;
  phone: string;
  email: string;
  contact_name: string;
  country: string;
  region: string;
  errors: string[];
}

interface ImportResult {
  imported: number;
  failed: number;
  errors: { row: number; error: string }[];
}

interface Props {
  onImport?: (suppliers: any[]) => Promise<void>;
  onCancel?: () => void;
  organizationId?: string;
}

export default function SupplierImport({ onImport, onCancel, organizationId }: Props) {
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCSV(text);
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    try {
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) { setError("CSV must have a header row and at least one data row"); return; }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.indexOf("name");
      const phoneIdx = headers.indexOf("phone");
      const emailIdx = headers.indexOf("email");
      const contactIdx = headers.indexOf("contact_name");
      const countryIdx = headers.indexOf("country");
      const regionIdx = headers.indexOf("region");

      if (nameIdx === -1 || phoneIdx === -1) { setError("CSV must have 'name' and 'phone' columns"); return; }

      const rows: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const errs: string[] = [];
        const name = cols[nameIdx] || "";
        const phone = cols[phoneIdx] || "";

        if (!name) errs.push("Missing name");
        if (!phone) errs.push("Missing phone");
        else if (phone.length < 5) errs.push("Invalid phone");

        rows.push({
          row: i + 1,
          name,
          phone,
          email: cols[emailIdx] || "",
          contact_name: cols[contactIdx] || "",
          country: cols[countryIdx] || "",
          region: cols[regionIdx] || "",
          errors: errs,
        });
      }

      setParsed(rows);
    } catch {
      setError("Failed to parse CSV. Check format.");
    }
  };

  const handleImport = async () => {
    if (!onImport) return;
    const valid = parsed.filter((r) => r.errors.length === 0);
    if (valid.length === 0) { setError("No valid rows to import"); return; }

    setImporting(true);
    setError(null);
    try {
      const payload = valid.map((r) => ({
        name: r.name,
        phone: r.phone,
        email: r.email || null,
        contact_name: r.contact_name || null,
        metadata: { country: r.country, region: r.region },
      }));

      const res = await fetch("/api/suppliers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppliers: payload, organization_id: organizationId || "" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult({ imported: data.imported || valid.length, failed: data.failed || 0, errors: data.errors || [] });
      setParsed([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-slate-600/50 rounded-lg p-8 text-center hover:border-cyan-500/30 transition-colors">
        {!parsed.length ? (
          <>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer space-y-2 block">
              <div className="text-2xl text-slate-500">📄</div>
              <p className="text-sm text-slate-400">Drop a CSV file or click to browse</p>
              <p className="text-[10px] text-slate-600">Required: name, phone | Optional: email, contact_name, country, region</p>
            </label>
          </>
        ) : (
          <div className="text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">{parsed.length} row(s) parsed</span>
              <button onClick={() => { setParsed([]); setResult(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-[10px] text-slate-500 hover:text-slate-300">Clear</button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {parsed.map((r) => (
                <div key={r.row} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${r.errors.length ? "bg-red-900/20" : "bg-slate-800/30"}`}>
                  <span className="text-slate-600 font-mono w-6">{r.row}</span>
                  <span className={`${r.errors.length ? "text-red-300" : "text-slate-200"} font-medium w-28 truncate`}>{r.name || "—"}</span>
                  <span className="text-slate-400 w-24 truncate">{r.phone}</span>
                  <span className="text-slate-500 w-24 truncate">{r.email || "—"}</span>
                  {r.errors.length > 0 && (
                    <span className="text-red-400 text-[10px]">{r.errors.join(", ")}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-xs text-red-400 p-3 rounded-lg bg-red-900/10 border border-red-500/20">{error}</div>}
      {result && (
        <div className={`text-xs p-3 rounded-lg border ${result.imported > 0 ? "bg-emerald-900/10 border-emerald-500/20 text-emerald-300" : "bg-red-900/10 border-red-500/20 text-red-300"}`}>
          Imported {result.imported} supplier(s)
          {result.failed > 0 && `, ${result.failed} failed`}
        </div>
      )}

      {parsed.filter((r) => r.errors.length === 0).length > 0 && (
        <div className="flex justify-end gap-2">
          {onCancel && <button onClick={onCancel} className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200">Cancel</button>}
          <button onClick={handleImport} disabled={importing} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
            {importing ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              `Import ${parsed.filter((r) => r.errors.length === 0).length} Supplier(s)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
