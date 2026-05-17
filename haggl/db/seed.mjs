/**
 * HAGGL seed script.
 * Usage: node db/seed.mjs
 *
 * Creates a default organization and sample data.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuid } from "uuid";

const DEMO_ORG_ID =
  process.env.NEXT_PUBLIC_DEMO_ORG_ID ||
  "00000000-0000-0000-0000-000000000001";
const DEMO_USER_ID =
  process.env.DEMO_USER_ID ||
  "00000000-0000-0000-0000-000000000001";
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || "demo@haggl.ai";

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

  const orgId = DEMO_ORG_ID;

  const { error: orgErr } = await supabase.from("organizations").upsert(
    {
      id: orgId,
      name: "HAGGL Demo Organization",
      api_key: "demo",
    },
    { onConflict: "id" },
  );
  if (orgErr) {
    console.error("Seed org error:", orgErr.message);
    return;
  }
  console.log("Ensured demo organization:", orgId);

  const { error: userErr } = await supabase.from("users").upsert(
    {
      id: DEMO_USER_ID,
      organization_id: orgId,
      email: DEMO_USER_EMAIL,
      name: "Demo User",
      role: "admin",
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (userErr) {
    console.error("Seed user error:", userErr.message);
  } else {
    console.log("Ensured demo user:", DEMO_USER_EMAIL);
  }

  const suppliers = [
    { name: "Acme Corp", contact_name: "John", phone: "+15551234567", dialect_prompt: "Formal, address as Mr. Smith" },
    { name: "Global Supplies Inc", contact_name: "Sarah", phone: "+15557654321", dialect_prompt: "Direct and concise" },
    { name: "Prime Parts LLC", contact_name: "Mike", phone: "+15559876543", dialect_prompt: null },
  ];

  for (const s of suppliers) {
    const { data: existingSupplier, error: existingSupplierErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone", s.phone)
      .maybeSingle();

    if (existingSupplierErr) {
      console.error("Seed supplier lookup error:", existingSupplierErr.message);
      continue;
    }

    if (existingSupplier) {
      console.log("  Supplier already exists:", s.name);
      continue;
    }

    const { error } = await supabase.from("suppliers").insert({
      id: uuid(),
      organization_id: orgId,
      ...s,
    });
    if (error) console.error("Seed supplier error:", error.message);
    else console.log("  Created supplier:", s.name);
  }

  const { data: existingRfq, error: existingRfqErr } = await supabase
    .from("rfqs")
    .select("id")
    .eq("organization_id", orgId)
    .eq("title", "Q1 Steel Procurement")
    .maybeSingle();

  if (existingRfqErr) {
    console.error("Seed RFQ lookup error:", existingRfqErr.message);
  } else if (!existingRfq) {
    const { error: rfqErr } = await supabase.from("rfqs").insert({
      id: uuid(),
      organization_id: orgId,
      created_by: DEMO_USER_ID,
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
  } else {
    console.log("  Sample RFQ already exists");
  }

  console.log("Seed complete.");
}

seed().catch(console.error);
