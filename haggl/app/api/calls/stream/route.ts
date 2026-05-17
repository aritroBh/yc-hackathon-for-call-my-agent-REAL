import { NextResponse } from "next/server";

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { message: "Twilio stream endpoint deprecated — using AgentPhone" },
    { status: 410 }
  );
}

export async function POST(): Promise<Response> {
  return NextResponse.json(
    { message: "Twilio stream endpoint deprecated — using AgentPhone" },
    { status: 410 }
  );
}
