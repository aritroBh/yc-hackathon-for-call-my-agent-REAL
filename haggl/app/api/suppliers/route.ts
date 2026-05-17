import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tables } from "@/lib/db";
import { SupplierCreateSchema, SupplierUpdateSchema } from "@/lib/validators";
import { processSupplierImport } from "@/lib/csv-import";
import type { SupplierRow } from "@/types/database";

const ListQuerySchema = z.object({
  organization_id: z.string().uuid("Invalid organization_id"),
  status: z.enum(["active", "inactive", "blacklisted"]).optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
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

    let query = tables.suppliers
      .select("*", { count: "exact" })
      .eq("organization_id", organization_id)
      .order("name")
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,contact_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      data: data as SupplierRow[],
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
    const { searchParams } = new URL(request.url);
    const contentType = request.headers.get("content-type") || "";
    const isCSVImport = searchParams.get("import") === "true" || contentType.includes("text/csv");

    if (isCSVImport) {
      let csvText: string;

      if (contentType.includes("text/csv") || contentType.includes("application/octet-stream")) {
        csvText = await request.text();
      } else {
        const body = await request.json();
        csvText = body.csv || body.text || "";
        if (!csvText) {
          return NextResponse.json(
            { error: "CSV data required. Send as raw body (text/csv) or JSON with { csv: '...' }" },
            { status: 400 },
          );
        }
      }

      const organizationId = searchParams.get("organization_id");
      if (!organizationId) {
        return NextResponse.json(
          { error: "organization_id query parameter is required for CSV import" },
          { status: 400 },
        );
      }

      const result = await processSupplierImport(csvText, organizationId);

      const status = result.errors.length > 0 && result.insertedCount === 0 ? 422 : 201;

      return NextResponse.json(result, { status });
    }

    const body = await request.json();
    const parsed = SupplierCreateSchema.parse(body);

    const { data, error } = await tables.suppliers
      .insert(parsed)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Supplier with this phone already exists in this organization" },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json(data as SupplierRow, { status: 201 });
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
      const pgErr = err as unknown as { code: string; details?: string };
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

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = SupplierUpdateSchema.parse(body);

    const { data, error } = await tables.suppliers
      .update(parsed)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(data as SupplierRow);
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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
    }

    const { error } = await tables.suppliers.delete().eq("id", id);
    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
      }
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Cannot delete: supplier has associated records (calls or RFQs)" },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
