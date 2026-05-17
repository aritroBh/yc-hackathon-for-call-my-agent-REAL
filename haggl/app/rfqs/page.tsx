"use client";

import { useEffect, useState } from "react";
import type { RFQ } from "@/types";

interface RFQFormData {
  title: string;
  description: string;
  target_price: string;
  deadline: string;
  items: { sku: string; description: string; quantity: string; unit: string; target_unit_price: string }[];
}

const emptyForm: RFQFormData = {
  title: "",
  description: "",
  target_price: "",
  deadline: "",
  items: [{ sku: "", description: "", quantity: "1", unit: "piece", target_unit_price: "" }],
};

export default function RFQPage() {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<RFQFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState<string | null>(null);
  const [dispatchedIds, setDispatchedIds] = useState<Set<string>>(new Set());

  const fetchRfqs = async () => {
    try {
      const res = await fetch("/api/rfqs");
      if (!res.ok) throw new Error("Failed to fetch RFQs");
      setRfqs(await res.json());
      setError(null);
    } catch {
      setError("Failed to load RFQs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRfqs(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        target_price: form.target_price ? Number(form.target_price) : null,
        deadline: form.deadline || null,
        items: form.items.map((i) => ({
          sku: i.sku,
          description: i.description,
          quantity: Number(i.quantity),
          unit: i.unit,
          target_unit_price: i.target_unit_price ? Number(i.target_unit_price) : null,
        })),
      };
      const res = await fetch("/api/rfqs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to create RFQ");
      setShowModal(false);
      setForm(emptyForm);
      await fetchRfqs();
    } catch {
      setError("Failed to create RFQ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatch = async (rfqId: string) => {
    setDispatchLoading(rfqId);
    try {
      const res = await fetch("/api/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfq_id: rfqId }) });
      if (res.status === 409) {
        alert("Dispatch already in progress for this RFQ.");
        setDispatchedIds(prev => new Set(prev).add(rfqId));
        return;
      }
      if (!res.ok) throw new Error("Dispatch failed");
      
      setDispatchedIds(prev => new Set(prev).add(rfqId));
      await fetchRfqs();
    } catch {
      setError("Failed to dispatch RFQ");
      setDispatchLoading(null);
    } finally {
      // Only clear if we didn't succeed/409, meaning we errored and didn't add to set
      // Actually, if we succeed, we leave it in dispatchLoading or let the dispatchedIds take over.
      // The requirement says: "only clear dispatchLoading if the response was an error."
      if (!dispatchedIds.has(rfqId)) {
        // Wait, state update for dispatchedIds might not be reflected in this closure.
        // Let's just clear it if we hit the catch block. We did that above.
      }
    }
  };

  const addItem = () => {
    setForm((f) => ({ ...f, items: [...f.items, { sku: "", description: "", quantity: "1", unit: "piece", target_unit_price: "" }] }));
  };

  const removeItem = (idx: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const updateItem = (idx: number, field: string, value: string) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    }));
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800",
      open: "bg-blue-100 text-blue-800",
      negotiating: "bg-yellow-100 text-yellow-800",
      closed: "bg-green-100 text-green-800",
      awarded: "bg-purple-100 text-purple-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-800"}`}>
        {status}
      </span>
    );
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">RFQs</h1>
        <button onClick={() => setShowModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          New RFQ
        </button>
      </div>

      {rfqs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No RFQs found. Create one to get started.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Target Price</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((rfq) => (
                  <tr key={rfq.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{rfq.title}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{rfq.description}</td>
                    <td className="px-4 py-3">{statusBadge(rfq.status)}</td>
                    <td className="px-4 py-3 text-gray-600">{rfq.items?.length || 0}</td>
                    <td className="px-4 py-3 text-gray-600">{rfq.target_price ? `$${rfq.target_price}` : "--"}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(rfq.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <a href={`/rfqs/${rfq.id}`} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">View</a>
                        <button
                          onClick={() => handleDispatch(rfq.id)}
                          disabled={dispatchLoading === rfq.id || dispatchedIds.has(rfq.id)}
                          className={`text-sm font-medium disabled:opacity-50 ${dispatchedIds.has(rfq.id) ? "text-gray-500" : "text-green-600 hover:text-green-800"}`}
                        >
                          {dispatchedIds.has(rfq.id) ? "Dispatched ✓" : dispatchLoading === rfq.id ? "..." : "Dispatch"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New RFQ</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Price ($)</label>
                  <input type="number" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Items</label>
                  <button type="button" onClick={addItem} className="text-indigo-600 text-sm hover:text-indigo-800">+ Add Item</button>
                </div>
                {form.items.map((item, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500 font-medium">Item {idx + 1}</span>
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="text-red-500 text-xs hover:text-red-700">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="SKU" required value={item.sku} onChange={(e) => updateItem(idx, "sku", e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                      <input placeholder="Unit" required value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <input placeholder="Description" required value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="Quantity" required value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                      <input type="number" placeholder="Target Unit Price ($)" value={item.target_unit_price} onChange={(e) => updateItem(idx, "target_unit_price", e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={submitting} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {submitting ? "Creating..." : "Create RFQ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
