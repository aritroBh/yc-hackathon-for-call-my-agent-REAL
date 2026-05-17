/**
 * HAGGL seed script.
 * Usage: node db/seed.mjs
 *
 * Creates a default organization and sample data.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuid } from "uuid";

async function seed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env vars");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const orgId = uuid();

  const { error: orgErr } = await supabase.from("organizations").insert({
    id: orgId,
    name: "Default Organization",
    api_key: "default",
  });
  if (orgErr) {
    console.error("Seed org error:", orgErr.message);
    return;
  }
  console.log("Created default organization:", orgId);

  const suppliers = [
    { name: "Acme Corp", contact_name: "John", phone: "+15551234567", dialect_prompt: "Formal, address as Mr. Smith" },
    { name: "Global Supplies Inc", contact_name: "Sarah", phone: "+15557654321", dialect_prompt: "Direct and concise" },
    { name: "Prime Parts LLC", contact_name: "Mike", phone: "+15559876543", dialect_prompt: null },
  ];

  for (const s of suppliers) {
    const { error } = await supabase.from("suppliers").insert({
      id: uuid(),
      organization_id: orgId,
      ...s,
    });
    if (error) console.error("Seed supplier error:", error.message);
    else console.log("  Created supplier:", s.name);
  }

  const { error: rfqErr } = await supabase.from("rfqs").insert({
    id: uuid(),
    organization_id: orgId,
    title: "Q1 Steel Procurement",
    description: "Need 5000 tons of grade A structural steel",
    items: [
      { sku: "STEEL-A-001", description: "Grade A structural steel beam", quantity: 5000, unit: "tons", target_unit_price: 850 },
    ],
    target_price: 4250000,
    status: "open",
  });
  if (rfqErr) console.error("Seed RFQ error:", rfqErr.message);
  else console.log("  Created sample RFQ");

  console.log("Seed complete.");
}

seed().catch(console.error);
