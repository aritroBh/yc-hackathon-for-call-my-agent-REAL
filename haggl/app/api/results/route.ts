import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";
import type { CallRow } from "@/types/database";

export async function GET() {
  try {
    const { data, error } = await tables.calls
      .select("*")
      .eq("status", "completed")
      .order("ended_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data as CallRow[]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
