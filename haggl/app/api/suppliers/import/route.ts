import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processSupplierImport, generateExampleCSV } from "@/lib/csv-import";

const OrgIdSchema = z.string().uuid("Invalid organization_id");

export async function POST(request: NextRequest) {
  try {
    let organization_id: string | null = new URL(request.url).searchParams.get("organization_id");
    const contentType = request.headers.get("content-type") || "";
    let csvText: string;

    if (contentType.includes("text/csv")) {
      csvText = await request.text();
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json(
          { error: "CSV file required as form field 'file'" },
          { status: 400 },
        );
      }
      const blob = file as Blob;
      csvText = await blob.text();
      if (!organization_id) organization_id = formData.get("organization_id") as string | null;
    } else {
      const body = await request.json().catch(() => ({}));
      csvText = body.csv || body.text || "";
      if (!organization_id) organization_id = body.organization_id || null;
      if (!csvText) {
        return NextResponse.json(
          { error: "CSV data required. Send as: text/csv body, multipart form (field: file), or JSON { csv: '...' }" },
          { status: 400 },
        );
      }
    }

    const parsedOrg = OrgIdSchema.safeParse(organization_id);
    if (!parsedOrg.success) {
      return NextResponse.json({ error: "Valid organization_id required (UUID, as query param, form field, or body field)" }, { status: 400 });
    }

    const result = await processSupplierImport(csvText, parsedOrg.data);

    const responseStatus =
      result.errors.length > 0 && result.insertedCount === 0 ? 422 : 201;

    return NextResponse.json(result, { status: responseStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Import failed", details: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  const csv = generateExampleCSV();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="haggl_supplier_import_example.csv"',
    },
  });
}
