import Supermemory from 'supermemory'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' })
} else {
  dotenv.config({ path: '.env.local' })
}

const client = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY! })

const CONTAINERS = {
  COMPANY:   'haggl-company-context',
  LANGUAGES: 'haggl-language-context',
  VENDORS:   'haggl-vendor-context',
}

// ── 1. COMPANY CONTEXT ───────────────────────────────
const COMPANY_MEMORIES = [
  {
    content: `HAGGL is an autonomous AI procurement negotiation platform. It calls suppliers on behalf of US buyers, negotiates pricing and terms via voice, and closes deals — all without human involvement. Founded 2026. Based in San Francisco.`,
    metadata: { category: 'identity' },
  },
  {
    content: `HAGGL's core differentiator: it negotiates in the supplier's native language. Current language support: Twi/Akan (Ghana), Yoruba (Nigeria), Hindi (India), English. This removes the language barrier that kills 40% of cross-border procurement deals.`,
    metadata: { category: 'differentiator' },
  },
  {
    content: `HAGGL's target market: US companies importing from West Africa and South Asia. Primary verticals: textiles (Ghana, Nigeria), agriculture/cocoa (Ghana), garments (Nigeria, India), manufactured parts (India). Average deal size: $20,000–$500,000 USD.`,
    metadata: { category: 'market' },
  },
  {
    content: `HAGGL's negotiation pipeline: 1) Browser Use researches supplier before call. 2) AgentPhone places outbound call. 3) Claude Opus negotiates in supplier's language. 4) Moss provides real-time market pricing facts mid-call. 5) Supermemory provides historical supplier intel. 6) Post-call: Haiku extracts deal terms, Sponge records transaction, Stripe generates payment link, AgentMail sends summaries, Browser Use fills customs forms.`,
    metadata: { category: 'pipeline' },
  },
  {
    content: `HAGGL pricing model: per-call fee + success commission. Typical savings: 12-18% below initial supplier ask. ROI for buyer: 10-20x HAGGL fee on a $50,000 order. Current pilot customers: US textile importers sourcing from Ghana.`,
    metadata: { category: 'business_model' },
  },
  {
    content: `HAGGL's floor price protection: buyer sets a confidential floor price encrypted with AES-256-GCM. The AI agent never reveals this number. It negotiates toward the target price and only accepts deals at or above the floor.`,
    metadata: { category: 'security' },
  },
]

// ── 2. LANGUAGE + CULTURAL CONTEXT ──────────────────
const LANGUAGE_MEMORIES = [
  // TWI / AKAN — GHANA
  {
    content: `Twi (also called Akan or Asante Twi) is the primary business language in Ghana, especially Accra and Kumasi. Spoken by ~9 million people. Key negotiation phrases: "Mema wo akye" (good morning), "Meda wo ase" (thank you), "Nante yiye" (goodbye), "Wo boɔ no yɛ den kakra" (your price is a bit high), "Ma yɛn ne agyree" (let us agree), "Aane" (yes), "Dabi" (no).`,
    metadata: { locale: 'tw-GH', category: 'phrases' },
  },
  {
    content: `Twi negotiation culture: relationship-first. Always ask "Wo ho te sɛn?" (how are you?) before any business. Never rush. Patience signals respect. Use honorifics: "Owura" (Sir) and "Awuraa" (Madam). Indirect refusals only — never say "no" directly, use "Ɛyɛ den kakra" (it is a bit difficult). Silence after a price offer is normal — do not fill it.`,
    metadata: { locale: 'tw-GH', category: 'culture' },
  },
  {
    content: `Ghana business context: Mobile Money (MTN MoMo, Vodafone Cash) is the dominant B2B payment for orders under $5,000. Bank transfer for larger orders. AGOA (African Growth and Opportunity Act) certification allows duty-free US import — always ask if supplier is AGOA-certified. Ghana Standards Authority (GSA) is the quality regulator. Typical textile lead times: 6-10 weeks. Kente cloth: $8-14/yard depending on complexity.`,
    metadata: { locale: 'tw-GH', category: 'business_context' },
  },
  {
    content: `Akan proverbs useful in negotiation: "Onipa na ohyehyɛ onipa" (it is the person who dresses another person) — use to emphasize partnership. "Tete bekum apem a, apem beba" (if the past kills thousands, thousands will come) — use to reference long-term relationship value. Proverbs build trust rapidly with Ghanaian suppliers.`,
    metadata: { locale: 'tw-GH', category: 'proverbs' },
  },

  // YORUBA — NIGERIA
  {
    content: `Yoruba is the primary business language in Lagos, Ibadan, and southwest Nigeria. Spoken by ~45 million people. Key negotiation phrases: "Ẹ káàárọ̀" (good morning), "Ẹ káàsán" (good afternoon), "Ẹ káalẹ̀" (good evening), "Ẹ ṣéun" (thank you), "Beeni" (yes), "Bẹ́ẹ̀ kọ" (no), "Iye ga jù" (price is too high), "Ẹ din kù díẹ̀" (reduce a little), "O dàbọ̀" (goodbye).`,
    metadata: { locale: 'yo-NG', category: 'phrases' },
  },
  {
    content: `Yoruba negotiation culture: highly formal and hierarchical. Use the respectful plural "Ẹ" (not "o") for anyone senior. Titles matter: Alhaji (Muslim elder), Chief, Dr., Engineer. Always greet extensively before business — skipping greetings is deeply offensive. Bargaining is expected and respected; accepting first offer is unusual. Confirm everything in writing (email or WhatsApp).`,
    metadata: { locale: 'yo-NG', category: 'culture' },
  },
  {
    content: `Nigeria business context: Bank transfer (USD or NGN) is standard for B2B. Flutterwave and Paystack are common payment rails. Suppliers often quote in USD but expect NGN payment — clarify currency upfront. CBN (Central Bank of Nigeria) regulations affect FX — ask if supplier has a domiciliary account. Lagos suppliers move fast and expect decisions same-day. Abuja suppliers are more formal and slower. Lead times: 4-8 weeks typical for garments.`,
    metadata: { locale: 'yo-NG', category: 'business_context' },
  },
  {
    content: `Yoruba proverbs for negotiation: "Ọmọ tó bá fẹ́ jẹ orí inú àgbàdo ló máa ń yọ irun rẹ̀" (patience yields results). "Àgbàdo tó bá sọ ara rẹ̀ sílẹ̀ ni àgbàdo tó ń pọn" (the corn that falls is the one that ripens) — use to show a deal that closes now benefits both sides. Proverbs demonstrate cultural intelligence and build immediate trust.`,
    metadata: { locale: 'yo-NG', category: 'proverbs' },
  },

  // HINDI — INDIA
  {
    content: `Hindi is the primary business language in North India: Delhi, Uttar Pradesh, Rajasthan, Gujarat (mixed), and manufacturing hubs like Ludhiana, Surat, and Kanpur. Key negotiation phrases: "Namaste ji" (respectful greeting), "Kya aap thoda aur kam kar sakte hain?" (can you reduce a little more?), "Yeh price thoda zyada hai" (this price is a bit high), "Hum bahut bada order denge" (we will give a very large order), "Dhanyavaad" (thank you), "Phir milenge" (we will meet again).`,
    metadata: { locale: 'hi-IN', category: 'phrases' },
  },
  {
    content: `Hindi/Indian negotiation culture: relationship-first but more transactional than West Africa. "Ji" suffix shows respect (e.g., "Aap ji"). Address as "Sahab" (Sir) or "Madam ji". Negotiating is expected — never accept first price. Volume commitments unlock best prices. Seasonal demand matters: avoid negotiating during Diwali (Oct-Nov) and Holi (March). GST compliance questions are common. Payment terms: advance 30-50% is standard, rest on delivery.`,
    metadata: { locale: 'hi-IN', category: 'culture' },
  },
  {
    content: `India manufacturing context: Ludhiana = woolen goods, hosiery. Surat = synthetic textiles, sarees. Tiruppur = knitwear, t-shirts. Kanpur = leather. For textiles, BIS (Bureau of Indian Standards) certification matters for quality. FIEO (Federation of Indian Export Organisations) members are vetted exporters. Typical lead times: 45-60 days for custom orders, 15-30 for stock items. Payment rails: wire transfer (SWIFT), Western Union for smaller amounts.`,
    metadata: { locale: 'hi-IN', category: 'business_context' },
  },
  {
    content: `Hindi negotiation tactics: "Yaar, itna toh nahi hoga" (friend, that much won't work) — casual pressure. "Dekho, hum aapke saath bahut kaam karna chahte hain" (look, we want to do a lot of business with you) — relationship leverage. Reference other suppliers: "Doosri jagah se $X mein aa raha hai" (it's coming for $X from elsewhere). Hindi suppliers respond well to long-term partnership framing over single-order pressure.`,
    metadata: { locale: 'hi-IN', category: 'tactics' },
  },

  // GENERAL WEST AFRICA
  {
    content: `West African business universal rules: 1) Never start with price — build rapport first. 2) Religious greetings matter: "Inshallah" for Muslim suppliers, "God willing" or "By God's grace" for Christian. 3) WhatsApp is the primary business communication channel — always offer to send quote follow-up via WhatsApp. 4) Friday afternoons unavailable (Jumu'ah prayers). 5) Power outages are real — suppliers may go offline mid-negotiation, call back.`,
    metadata: { locale: 'general-africa', category: 'universal' },
  },
  {
    content: `West African payment reality: US buyers wiring USD to West African suppliers often face delays due to correspondent banking. Options: 1) Flutterwave (Nigeria) — fast USD transfers. 2) Chipper Cash (Ghana/Nigeria) — good for smaller amounts. 3) WorldRemit — reliable for Ghana. 4) SWIFT to Ecobank, GTBank (Ghana), Access Bank (Nigeria) — slower but trusted. Always confirm the supplier's preferred method upfront.`,
    metadata: { locale: 'general-africa', category: 'payments' },
  },
]

// ── 3. VENDOR / PROCUREMENT CONTEXT ─────────────────
const VENDOR_MEMORIES = [
  // Pricing benchmarks
  {
    content: `West African textile pricing benchmarks (2026): Plain cotton fabric: $2.50-4.00/yard. Kente cloth (machine woven): $8-11/yard. Kente cloth (hand woven): $14-22/yard. Ankara/wax print fabric: $4-7/yard. Aso-Oke (Yoruba ceremonial): $12-18/yard. Adinkra cloth: $10-16/yard. Prices spike 15-25% during harvest festivals and election periods.`,
    metadata: { category: 'pricing', region: 'West Africa', commodity: 'textiles' },
  },
  {
    content: `Ghana cocoa and agricultural export benchmarks (2026): Raw cocoa beans: $3,200-3,800/metric ton (COCOBOD regulated). Processed cocoa butter: $5,500-6,200/metric ton. Shea butter: $1,800-2,400/metric ton (Grade A). Cashew nuts: $1,400-1,800/metric ton. All Ghana agri exports require COCOBOD or GEPC licensing — verify before committing.`,
    metadata: { category: 'pricing', region: 'Ghana', commodity: 'agriculture' },
  },
  {
    content: `Nigeria garment manufacturing benchmarks (2026): Basic polo shirt (50+ units): $4.50-7.00/unit. Dress shirt (custom): $9-14/unit. Ankara dress (custom): $18-28/unit. Denim jacket: $22-35/unit. MOQ for custom: 100-500 units typical. Suppliers in Aba (Abia State) are cheapest; Lagos suppliers have faster delivery and better quality control.`,
    metadata: { category: 'pricing', region: 'Nigeria', commodity: 'garments' },
  },
  {
    content: `India textile manufacturing benchmarks (2026): Cotton t-shirt (Tiruppur): $2.80-4.50/unit (200+ MOQ). Wool sweater (Ludhiana): $8-15/unit. Silk saree fabric: $6-12/yard. Synthetic fabric (Surat): $1.20-2.80/yard. Leather belt (Kanpur): $4-9/unit. Key certifications: GOTS (organic), OEKO-TEX Standard 100, SA8000 (labor). Indian suppliers often negotiate in lots — offer to increase order size for price reduction.`,
    metadata: { category: 'pricing', region: 'India', commodity: 'textiles' },
  },
  // Lead time knowledge
  {
    content: `Lead time reality for West African suppliers: Always add 30-40% buffer to stated lead time. Reasons: port congestion at Tema (Ghana) and Apapa (Nigeria), power outages affecting production, fabric sourcing delays. If supplier says 6 weeks, plan for 8-9. Request a production schedule with milestones. Partial shipments available from larger suppliers — ask for 50% delivery at 4 weeks.`,
    metadata: { category: 'lead_times', region: 'West Africa' },
  },
  {
    content: `Certifications to always verify for West African exports to US: 1) AGOA certification (duty-free access to US) — check at agoa.info. 2) Ghana Standards Authority (GSA) — for quality compliance. 3) NAFDAC (Nigeria) — for food/cosmetics. 4) SON (Standards Organisation of Nigeria) — for manufactured goods. 5) ECOWAS Trade Liberalization Scheme (ETLS) — for intra-Africa trade. Ask for certificate numbers, not just claims.`,
    metadata: { category: 'certifications', region: 'West Africa' },
  },
  {
    content: `Red flags in West African supplier negotiation: 1) No physical address or Google Maps presence. 2) Requests 100% upfront payment from unknown buyer. 3) No product samples available before bulk order. 4) Certificate numbers that don't match official registry. 5) Price that's 40%+ below market — likely quality issues or scam. 6) Pressure to use unofficial payment channels (crypto only, informal agents). Legitimate suppliers accept escrow or 50/50 payment terms.`,
    metadata: { category: 'risk', region: 'West Africa' },
  },
  // Negotiation patterns
  {
    content: `Effective negotiation patterns with West African suppliers: 1) Volume anchor first: "We are looking to do 5,000 units this quarter — and if quality is right, we'll triple that in Q2." 2) Long-term framing: "We want a supplier we can grow with for 3+ years." 3) Competitive reference: "We've received quotes from two other suppliers at $X — can you match?" 4) Certification leverage: "Our US buyers require AGOA certification — can you confirm?" 5) Split the difference: Always let supplier feel they won something.`,
    metadata: { category: 'tactics', region: 'West Africa' },
  },
  {
    content: `Known supplier archetypes in West Africa: 1) The Relationship Builder — spends 10 minutes on pleasantries, very loyal once trusted, slow to close on first call. 2) The Aggressive Anchor — opens 40% above market, expects hard negotiation. 3) The Capacity Exaggerator — claims unlimited stock/capacity, verify with small test order first. 4) The Quality Champion — focuses on certifications and process, price is secondary. Match your approach to the archetype.`,
    metadata: { category: 'archetypes', region: 'West Africa' },
  },
  {
    content: `Post-deal checklist for West African imports to US: 1) Obtain commercial invoice + packing list. 2) Request Bill of Lading (B/L) from freight forwarder. 3) Confirm HS tariff code (hts.usitc.gov) — wrong code = customs delay. 4) Check if goods require FDA, USDA, or FCC approval. 5) Arrange marine cargo insurance. 6) File ISF (Importer Security Filing) 24h before vessel loading. 7) CBP Form 3461 for US customs entry.`,
    metadata: { category: 'compliance', region: 'import_process' },
  },
  // Specific known suppliers (fictional but realistic)
  {
    content: `Kofi Textiles Ltd (Accra, Ghana): Specializes in kente and wax print fabrics. AGOA-certified. GSA quality mark holder. Typical initial ask: $10-11/yard for kente. Settled rate with HAGGL: $8.40/yard with 5,000-yard MOQ. Prefers Mobile Money for payments under $2,000, bank transfer for larger. Contact: Kofi Mensah. Language: Twi. Lead time: 8-10 weeks stated, actual 7 weeks. Reliable for Q2 delivery commitments.`,
    metadata: { category: 'supplier_profile', supplier: 'Kofi Textiles Ltd', country: 'GH' },
  },
  {
    content: `Adebayo Manufacturing (Lagos, Nigeria): Garment manufacturer. Specializes in Ankara-print garments and export-ready clothing. ISO 9001 certified. Typical initial ask: $12-15/unit for custom pieces. Best negotiated rate: $9.50/unit at 500+ unit orders. Prefers bank transfer (GTBank domiciliary account). Contact: Adebayo Okafor. Language: Yoruba. Lead time: 6 weeks stated, usually delivers in 5. Fast communicator on WhatsApp.`,
    metadata: { category: 'supplier_profile', supplier: 'Adebayo Manufacturing', country: 'NG' },
  },
  {
    content: `Ghana Agro Exports (Kumasi, Ghana): Agricultural commodity exporter. Cocoa, shea butter, cashews. COCOBOD licensed. GEPC certified exporter. Typical pricing: at COCOBOD benchmark rates ±5%. Negotiates on delivery terms and payment splits, not usually on price (regulated). Contact: Abena Asante. Language: Akan. Lead time: 4-6 weeks depending on harvest calendar. Avoid negotiating June-August (main cocoa harvest).`,
    metadata: { category: 'supplier_profile', supplier: 'Ghana Agro Exports', country: 'GH' },
  },
]

async function seedContainer(
  containerTag: string,
  memories: { content: string; metadata: Record<string, any> }[],
  label: string
) {
  console.log(`\nSeeding ${label} (${memories.length} memories)...`)
  let success = 0
  for (const mem of memories) {
    try {
      await client.add({
        content: mem.content,
        containerTags: [containerTag],
        metadata: mem.metadata,
      })
      success++
      process.stdout.write('.')
    } catch (err: any) {
      console.error(`\nFailed: ${err.message}`)
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200))
  }
  console.log(`\n✓ ${success}/${memories.length} stored in ${label}`)
}

async function main() {
  console.log('HAGGL Supermemory Seed Script')
  console.log('API key present:', !!process.env.SUPERMEMORY_API_KEY)

  await seedContainer(CONTAINERS.COMPANY, COMPANY_MEMORIES, 'Company Context')
  await seedContainer(CONTAINERS.LANGUAGES, LANGUAGE_MEMORIES, 'Language + Cultural Context')
  await seedContainer(CONTAINERS.VENDORS, VENDOR_MEMORIES, 'Vendor + Procurement Context')

  console.log('\n✅ All containers seeded. HAGGL Supermemory is ready.')
  console.log('Containers created:')
  console.log('  haggl-company-context    — who HAGGL is')
  console.log('  haggl-language-context   — Twi, Yoruba, Hindi culture')
  console.log('  haggl-vendor-context     — supplier knowledge, pricing, compliance')
  console.log('  haggl-negotiations       — populated live from real calls')
}

main().catch(console.error)
