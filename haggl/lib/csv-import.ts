import { z } from "zod";
import { CSVSupplierRowSchema, type CSVSupplierRow, type CSVRowError, type CSVImportResult } from "@/lib/validators";
import { getDialectByLocale } from "@/lib/prompts/dialectPrompts";
import type { SupplierRow } from "@/types/database";

const REGION_DIALECT_MAP: Record<string, string> = {
  "north india": "hi-IN",
  "south india": "si-IN",
  india: "hi-IN",
  "china mandarin": "zh-CN",
  "china cantonese": "zh-HK",
  china: "zh-CN",
  hongkong: "zh-HK",
  "hong kong": "zh-HK",
  mexico: "es-MX",
  latinam: "es-MX",
  "latin america": "es-MX",
  vietnam: "vi-VN",
  us: "",
  usa: "",
  uk: "",
  canada: "",
  australia: "",
  singapore: "",
  default: "",
};

const COUNTRY_DIALECT_MAP: Record<string, string> = {
  india: "hi-IN",
  china: "zh-CN",
  mexico: "es-MX",
  vietnam: "vi-VN",
  hongkong: "zh-HK",
  singapore: "zh-CN",
  malaysia: "zh-CN",
  taiwan: "zh-CN",
  brazil: "es-MX",
  argentina: "es-MX",
  colombia: "es-MX",
  chile: "es-MX",
  peru: "es-MX",
};

export function inferDialectLocale(
  country: string,
  region: string,
  language: string,
): string {
  const cleanCountry = country.toLowerCase().trim().replace(/\s+/g, "");
  const cleanRegion = region.toLowerCase().trim();
  const cleanLang = language.toLowerCase().trim();

  if (cleanLang === "hindi" || cleanLang === "hi") return "hi-IN";
  if (cleanLang === "tamil" || cleanLang === "kannada" || cleanLang === "telugu" || cleanLang === "malayalam") return "si-IN";
  if (cleanLang === "mandarin" || cleanLang === "chinese" || cleanLang === "zh-cn" || cleanLang === "cmn") return "zh-CN";
  if (cleanLang === "cantonese" || cleanLang === "yue" || cleanLang === "zh-hk") return "zh-HK";
  if (cleanLang === "spanish" || cleanLang === "es") return "es-MX";
  if (cleanLang === "vietnamese" || cleanLang === "vi") return "vi-VN";

  if (cleanRegion) {
    for (const [key, locale] of Object.entries(REGION_DIALECT_MAP)) {
      if (cleanRegion.includes(key) || key.includes(cleanRegion)) return locale;
    }
  }

  if (cleanCountry) {
    for (const [key, locale] of Object.entries(COUNTRY_DIALECT_MAP)) {
      if (cleanCountry.includes(key) || key.includes(cleanCountry)) return locale;
    }
  }

  return "";
}

export function buildDialectPromptFromRegion(locale: string): string {
  if (!locale) return "";
  const dialect = getDialectByLocale(locale);
  if (!dialect) return "";
  return [
    `Region: ${dialect.name}`,
    `Formality: ${dialect.formalityLevel}`,
    `Style: ${dialect.communicationStyle}`,
    dialect.culturalNotes ? `Notes: ${dialect.culturalNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

interface RawCSVRow {
  name: string;
  phone: string;
  country?: string;
  region?: string;
  contact_name?: string;
  language_primary?: string;
}

export function parseCSVBuffer(buffer: string): RawCSVRow[] {
  const lines = buffer
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) return [];

  const headerLine = lines[0].trim();
  const headers = parseCSVLine(headerLine).map((h) =>
    h.toLowerCase().replace(/["']/g, "").trim(),
  );

  const requiredFields = ["name", "phone"];
  const missing = requiredFields.filter((f) => !headers.includes(f));
  if (missing.length > 0) return [];

  const rows: RawCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i].trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").replace(/^["']|["']$/g, "").trim();
    });

    rows.push({
      name: row.name || "",
      phone: row.phone || "",
      country: row.country || "",
      region: row.region || "",
      contact_name: row.contact_name || "",
      language_primary: row.language_primary || row.language || "",
    });
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export async function processSupplierImport(
  raw: string,
  organizationId: string,
): Promise<CSVImportResult> {
  const result: CSVImportResult = {
    totalRows: 0,
    validRows: 0,
    skippedRows: 0,
    errorRows: 0,
    insertedCount: 0,
    errors: [],
    warnings: [],
    insertedIds: [],
  };

  const rawRows = parseCSVBuffer(raw);
  if (rawRows.length === 0) {
    result.errors.push({
      row: 0,
      field: "file",
      message: "No valid rows found. CSV must have header row with at least: name, phone",
      value: "",
    });
    return result;
  }

  result.totalRows = rawRows.length;

  const validated: { row: CSVSupplierRow; valid: true }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const r = rawRows[i];

    const zodResult = CSVSupplierRowSchema.safeParse(r);
    if (!zodResult.success) {
      result.errorRows++;
      for (const issue of zodResult.error.issues) {
        result.errors.push({
          row: rowNum,
          field: issue.path.join("."),
          message: issue.message,
          value: String(r[issue.path[0] as keyof typeof r] ?? ""),
        });
      }
      continue;
    }

    const parsed = zodResult.data;

    const dedupKey = `${parsed.phone}_${organizationId}`;
    if (seen.has(dedupKey)) {
      result.skippedRows++;
      result.warnings.push(`Row ${rowNum}: Duplicate phone "${parsed.phone}" within file, skipped`);
      continue;
    }
    seen.add(dedupKey);

    validated.push({ row: parsed, valid: true });
  }

  result.validRows = validated.length;

  if (validated.length === 0) return result;

  const locale = inferDialectLocale(
    rawRows[0]?.country || "",
    rawRows[0]?.region || "",
    rawRows[0]?.language_primary || "",
  );
  if (locale) {
    result.warnings.push(`Auto-detected dialect locale: ${locale} from first row's region/language`);
  }

  const { tables } = await import("@/lib/db");
  const { data: existing } = await tables.suppliers
    .select("phone")
    .eq("organization_id", organizationId);

  const existingPhones = new Set(
    ((existing as Pick<SupplierRow, "phone">[]) || []).map((s) =>
      s.phone.replace(/\s+/g, ""),
    ),
  );

  const toInsert: Array<{
    organization_id: string;
    name: string;
    contact_name: string | null;
    phone: string;
    email: string | null;
    status: "active";
    metadata: Record<string, unknown>;
  }> = [];

  for (const v of validated) {
    const cleanPhone = v.row.phone.replace(/\s+/g, "");
    if (existingPhones.has(cleanPhone)) {
      result.skippedRows++;
      result.warnings.push(`Supplier "${v.row.name}" (${v.row.phone}): already exists in organization, skipped`);
      continue;
    }

    const inferLocale = inferDialectLocale(v.row.country, v.row.region, v.row.language_primary);
    const dialectPrompt = inferLocale ? buildDialectPromptFromRegion(inferLocale) : "";

    toInsert.push({
      organization_id: organizationId,
      name: v.row.name,
      contact_name: v.row.contact_name || null,
      phone: v.row.phone,
      email: null,
      status: "active",
      metadata: {
        imported_from_csv: true,
        import_country: v.row.country || undefined,
        import_region: v.row.region || undefined,
        import_language: v.row.language_primary || undefined,
        language: v.row.language_primary || "english",
        dialect_locale: inferLocale || undefined,
        dialect_prompt: dialectPrompt || undefined,
        imported_at: new Date().toISOString(),
      },
    });
  }

  if (toInsert.length === 0) return result;

  try {
    const { data, error } = await tables.suppliers.insert(toInsert).select("id");
    if (error) {
      result.errors.push({
        row: 0,
        field: "db",
        message: `Database insert error: ${error.message}`,
        value: error.details || "",
      });
      return result;
    }
    result.insertedCount = (data as { id: string }[]).length;
    result.insertedIds = (data as { id: string }[]).map((d) => d.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push({
      row: 0,
      field: "db",
      message: `Database error: ${msg}`,
      value: "",
    });
  }

  return result;
}

export function generateExampleCSV(): string {
  const header = "name,phone,country,region,contact_name,language_primary";
  const rows = [
    "Acme Electronics, +1-555-0100,USA,North America,John Smith,English",
    "Bharat Steel Ltd, +91-9876543210,India,North India,Rajesh Kumar,Hindi",
    "Chennai Components, +91-9876543211,India,South India,Priya Sharma,English",
    "Shenzhen Tech Co, +86-138-0013-8000,China,China Mandarin,Wang Li,Mandarin",
    "Hong Kong Parts Ltd, +852-9123-4567,HongKong,China Cantonese,Chan Tai Man,Cantonese",
    "Mexico Manufacturing, +52-55-1234-5678,Mexico,Latin America,Carlos Gomez,Spanish",
    "Hanoi Handicrafts, +84-912-345-678,Vietnam,Southeast Asia,Nguyen Van An,Vietnamese",
    "Global Logistics Inc, +1-555-0200,Canada,North America,Sarah Wilson,English",
  ];
  return [header, ...rows].join("\n");
}
