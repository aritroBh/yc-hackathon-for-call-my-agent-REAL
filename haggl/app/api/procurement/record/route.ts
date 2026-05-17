import { NextRequest, NextResponse } from 'next/server'
import { tables } from '@/lib/db'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { rfq_id, supplier, amount, currency, call_id } = body

    // Store the procurement record
    await tables.reasoning_traces.insert({
      call_id: call_id || null,
      trace_type: 'sponge_deal_record',
      provider: 'sponge',
      phase: 'completed',
      input_data: { rfq_id, supplier, amount, currency },
      output_data: {
        recorded_at: new Date().toISOString(),
        payment_rail: 'sponge_x402',
        status: 'recorded',
      },
      tokens_used: null,
      latency_ms: null,
    })

    return NextResponse.json({
      ok: true,
      recorded: true,
      rfq_id,
      supplier,
      amount,
      currency,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
