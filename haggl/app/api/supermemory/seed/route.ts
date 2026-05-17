import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // Dynamically import to avoid bundling the full seed data
    const { execSync } = await import('child_process')
    
    // Just re-export the seed logic - don't actually shell out
    // Instead inline the critical seed function
    
    const Supermemory = (await import('supermemory')).default
    const client = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY! })

    if (!process.env.SUPERMEMORY_API_KEY) {
      return NextResponse.json({ error: 'SUPERMEMORY_API_KEY not set' }, { status: 400 })
    }

    // Quick seed — just 3 representative memories to verify it works
    const checks = await Promise.allSettled([
      client.add({
        content: 'HAGGL is an autonomous AI procurement platform negotiating in Twi, Yoruba, and Hindi.',
        containerTags: ['haggl-company-context'],
        metadata: { category: 'identity', seeded_at: new Date().toISOString() },
      }),
      client.add({
        content: 'Twi greeting: Mema wo akye. Thank you: Meda wo ase. Price too high: Wo boɔ no yɛ den kakra.',
        containerTags: ['haggl-language-context'],
        metadata: { locale: 'tw-GH', category: 'phrases', seeded_at: new Date().toISOString() },
      }),
      client.add({
        content: 'Kente cloth benchmark pricing 2026: machine woven $8-11/yard, hand woven $14-22/yard.',
        containerTags: ['haggl-vendor-context'],
        metadata: { category: 'pricing', region: 'Ghana', seeded_at: new Date().toISOString() },
      }),
    ])

    const succeeded = checks.filter(r => r.status === 'fulfilled').length
    const failed = checks.filter(r => r.status === 'rejected').length

    return NextResponse.json({
      message: `Seed check complete: ${succeeded} stored, ${failed} failed`,
      succeeded,
      failed,
      note: 'Run npx tsx scripts/seed-supermemory.ts for full seed',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
