import { NextResponse } from 'next/server'
import { getSpongeStatus } from '@/lib/sponsors/sponge'

export async function GET() {
  const status = await getSpongeStatus()
  if (!status) return NextResponse.json({ connected: false, agents: [], transactions: [] })
  return NextResponse.json({
    connected: true,
    agents: status.agents,
    transactions: status.transactions,
    transactionCount: status.transactions.length,
  })
}
