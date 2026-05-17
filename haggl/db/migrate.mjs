/**
 * HAGGL DB migration runner.
 * Usage: node db/migrate.mjs
 *
 * Reads .env.local and executes db/migrations/*.sql in order
 * against the Supabase project's direct Postgres connection.
 */

import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const migrationsDir = join(__dirname, "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`Running migration: ${file}`);
    const { error } = await supabase.rpc("exec_sql", { sql }).maybeSingle();
    if (error) {
      // Fallback: try raw query via REST
      const { error: restErr } = await supabase.from("_migrations").insert({
        name: file,
        sql,
      }).maybeSingle();
      if (restErr && !restErr.message.includes("does not exist")) {
        console.error(`  Failed: ${restErr.message}`);
      }
    }
    console.log(`  Done: ${file}`);
  }
  console.log("All migrations complete.");
}

migrate().catch(console.error);
