import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { callId: string } }
) {
  try {
    const { callId } = params;

    const { data, error } = await tables.reasoning_traces
      .select("*")
      .eq("input_data->>call_id", callId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
