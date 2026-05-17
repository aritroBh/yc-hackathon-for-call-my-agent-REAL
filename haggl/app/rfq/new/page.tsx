"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface DiscoveredSupplier {
  name: string; country: string; region: string
  language: string; phone: string; specialization: string; notes: string
}

type Step = "form" | "planning" | "plan_review" | "researching" | "suppliers" | "done"

const FLAG: Record<string, string> = {
  twi: "🇬🇭", akan: "🇬🇭", yoruba: "🇳🇬", hindi: "🇮🇳", english: "🌐",
}

export default function NewRFQPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("form")
  const [form, setForm] = useState({ title: "", description: "", items: "" })
  const [log, setLog] = useState<string[]>([])
  const [plan, setPlan] = useState<string>("")
  const [interactionId, setInteractionId] = useState<string>("")
  const [suppliers, setSuppliers] = useState<DiscoveredSupplier[]>([])
  const [rfqId, setRfqId] = useState<string>("")
  const [error, setError] = useState<string>("")

  const addLog = (msg: string) => setLog(prev => [...prev, msg])

  const streamRequest = async (body: object, handlers: {
    status?: (msg: string) => void
    plan?: (id: string, text: string) => void
    suppliers_found?: (s: DiscoveredSupplier[]) => void
    supplier_created?: (data: any) => void
    done?: (data: any) => void
    error?: (msg: string) => void
  }) => {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split("\n\n")
      buf = parts.pop() || ""
      for (const part of parts) {
        const line = part.replace(/^data: /, "").trim()
        if (!line) continue
        try {
          const evt = JSON.parse(line)
          if (evt.type === "status" && handlers.status) handlers.status(evt.message)
          if (evt.type === "plan" && handlers.plan) handlers.plan(evt.interactionId, evt.plan)
          if (evt.type === "suppliers_found" && handlers.suppliers_found) handlers.suppliers_found(evt.suppliers)
          if (evt.type === "supplier_created" && handlers.supplier_created) handlers.supplier_created(evt)
          if (evt.type === "done" && handlers.done) handlers.done(evt)
          if (evt.type === "error" && handlers.error) handlers.error(evt.message)
        } catch {}
      }
    }
  }

  const handlePlan = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setError("Title and description required."); return
    }
    setError("")
    setStep("planning")
    setLog([])

    await streamRequest(
      { action: "plan", rfq_title: form.title, rfq_description: form.description, items: form.items },
      {
        status: (msg) => addLog(msg),
        plan: (id, text) => {
          setInteractionId(id)
          setPlan(text)
          setStep("plan_review")
        },
        error: (msg) => { setError(msg); setStep("form") },
      }
    )
  }

  const handleExecute = async () => {
    setStep("researching")
    setLog([])

    await streamRequest(
      { action: "execute", rfq_title: form.title, rfq_description: form.description, items: form.items, interaction_id: interactionId },
      {
        status: (msg) => addLog(msg),
        suppliers_found: (s) => setSuppliers(s),
        supplier_created: (d) => addLog(`✓ Created ${d.name} (${d.language}) → ${d.phone}`),
        done: (d) => { setRfqId(d.rfq_id); setStep("suppliers") },
        error: (msg) => { setError(msg); setStep("plan_review") },
      }
    )
  }

  const handleDispatch = async () => {
    if (!rfqId) return
    setStep("done")
    await fetch("/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfq_id: rfqId }),
    })
    router.push(`/rfq/${rfqId}/monitor`)
  }

  const input = "w-full bg-[#111] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
  const btn = "px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">

        <div>
          <h1 className="text-2xl font-bold font-mono">New Procurement RFQ</h1>
          <p className="text-slate-500 text-sm mt-1 font-mono">
            Gemini Deep Research finds real suppliers → HAGGL calls them in their language
          </p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* STEP: Form */}
        {step === "form" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">What do you want to buy?</label>
              <input className={input} placeholder="5,000 yards of kente fabric" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">Details</label>
              <textarea className={input + " min-h-[100px] resize-none"}
                placeholder="Export quality, AGOA certified suppliers preferred. Need delivery within 60 days. Sourcing from West Africa or South Asia."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">Items (optional)</label>
              <input className={input} placeholder="5000 yards kente cloth, 48in width, export quality"
                value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} />
            </div>
            <button onClick={handlePlan}
              className={btn + " bg-indigo-600 hover:bg-indigo-500 text-white w-full text-center"}>
              🔍 Find Suppliers with Gemini Deep Research
            </button>
          </div>
        )}

        {/* STEP: Planning */}
        {step === "planning" && (
          <div className="border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono text-indigo-400">Gemini Deep Research — building plan...</span>
            </div>
            {log.map((l, i) => <p key={i} className="text-xs text-slate-500 font-mono">{l}</p>)}
          </div>
        )}

        {/* STEP: Plan review */}
        {step === "plan_review" && (
          <div className="space-y-4">
            <div className="border border-slate-700 rounded-lg p-4">
              <h2 className="text-xs text-slate-400 uppercase tracking-wider mb-3">Research Plan</h2>
              <div className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                {plan || "Plan ready. Deep Research will search for real suppliers matching your requirements."}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleExecute}
                className={btn + " bg-emerald-700 hover:bg-emerald-600 text-white flex-1"}>
                ✓ Approve — Start Research
              </button>
              <button onClick={() => setStep("form")}
                className={btn + " border border-slate-700 hover:border-slate-500 text-slate-400"}>
                ← Edit
              </button>
            </div>
          </div>
        )}

        {/* STEP: Researching */}
        {step === "researching" && (
          <div className="border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono text-emerald-400">Deep Research executing...</span>
            </div>
            <p className="text-xs text-slate-500 font-mono">This takes 2-5 minutes. Gemini is searching the web for real suppliers.</p>
            {log.map((l, i) => <p key={i} className="text-xs text-slate-400 font-mono">{l}</p>)}
          </div>
        )}

        {/* STEP: Suppliers found */}
        {step === "suppliers" && (
          <div className="space-y-4">
            <h2 className="text-sm font-mono text-slate-400 uppercase tracking-wider">
              {suppliers.length} Suppliers Found
            </h2>
            <div className="space-y-3">
              {suppliers.map((s, i) => (
                <div key={i} className="border border-slate-800 rounded-lg p-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{FLAG[s.language] || "🌐"}</span>
                      <span className="font-medium text-sm">{s.name}</span>
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded capitalize">{s.language}</span>
                    </div>
                    <p className="text-xs text-slate-500">{s.region}, {s.country}</p>
                    <p className="text-xs text-slate-400 mt-1">{s.specialization}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-indigo-400">{s.phone}</p>
                    <p className="text-xs text-slate-600 mt-1">ready to call</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleDispatch}
              className={btn + " bg-indigo-600 hover:bg-indigo-500 text-white w-full text-center"}>
              📞 Dispatch Calls Now
            </button>
          </div>
        )}

        {/* STEP: Dispatching */}
        {step === "done" && (
          <div className="text-center space-y-2">
            <div className="w-3 h-3 bg-green-500 rounded-full mx-auto animate-pulse" />
            <p className="text-sm text-slate-400 font-mono">Dispatching calls... redirecting to monitor</p>
          </div>
        )}

      </div>
    </div>
  )
}
