import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tables } from "@/lib/db";
import { RFQCreateSchema, RFQUpdateSchema } from "@/lib/validators";
import type { RFQRow } from "@/types/database";

const ListQuerySchema = z.object({
  organization_id: z.string().uuid("Invalid organization_id"),
  status: z
    .enum(["draft", "open", "negotiating", "closed", "awarded", "cancelled"])
    .optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ListQuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { organization_id, status, search, limit, offset } = parsed.data;

    let query = tables.rfqs
      .select("*", { count: "exact" })
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      data: data as RFQRow[],
      total: count ?? data?.length ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RFQCreateSchema.parse(body);

    const { data, error } = await tables.rfqs
      .insert(parsed)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data as RFQRow, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        },
        { status: 400 },
      );
    }
    if (err instanceof Error && "code" in err) {
      const pgErr = err as unknown as { code: string; details?: string; message: string };
      if (pgErr.code === "23503") {
        return NextResponse.json(
          { error: "Referenced entity not found", details: pgErr.details || "" },
          { status: 409 },
        );
      }
      if (pgErr.code === "23505") {
        return NextResponse.json(
          { error: "Duplicate entry", details: pgErr.details || "" },
          { status: 409 },
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
