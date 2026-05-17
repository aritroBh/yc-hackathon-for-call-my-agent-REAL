"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RFQWizard from "@/components/RFQWizard";
import SupplierImport from "@/components/SupplierImport";
import type { RfqFormData } from "@/components/RFQWizard";

export default function NewRFQPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (form: RfqFormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        description: form.description,
        target_price: form.target_price ? Number(form.target_price) : null,
        floor_price: form.floor_price ? Number(form.floor_price) : null,
        currency: form.currency || "USD",
        deadline: form.deadline || null,
        aggressiveness: form.aggressiveness,
        priority: form.priority,
        items: form.items.map((i) => ({
          sku: i.sku,
          description: i.description,
          quantity: Number(i.quantity),
          unit: i.unit,
          target_unit_price: i.target_unit_price ? Number(i.target_unit_price) : null,
        })),
      };

      const res = await fetch("/api/rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const rfq = await res.json();
      router.push(`/rfq/${rfq.id}/monitor`);
    } catch (err: any) {
      setError(err.message || "Failed to create RFQ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">New RFQ</h1>
          <p className="text-xs text-slate-500 mt-1">Create a request for quote and configure negotiation parameters</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
        <RFQWizard onSubmit={handleSubmit} submitting={submitting} />
      </div>

      <div className="border-t border-slate-800 pt-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Import Suppliers</h2>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <SupplierImport />
        </div>
      </div>
    </div>
  );
}
