import {
  buildSystemPrompt,
  type NegotiationConfig,
  type AggressivenessMode,
  type PriorityMode,
  type VoicemailBehavior,
} from "@/lib/prompts/negotiationPrompt";
import {
  buildDialectSection,
  buildFormalityInstruction,
  buildMultilingualInstruction,
  getDialectByLocale,
  type DialectContext,
} from "@/lib/prompts/dialectPrompts";
import type { RFQRow, SupplierRow } from "@/types/database";
import type { DialectConfigRow } from "@/types/database";

export interface PromptBuilderInput {
  rfq: Pick<
    RFQRow,
    | "title"
    | "description"
    | "items"
    | "target_price"
    | "floor_price"
    | "currency"
    | "deadline"
  >;
  supplier: Pick<
    SupplierRow,
    "name" | "contact_name" | "phone" | "email" | "metadata"
  >;
  dialectConfig?: Pick<
    DialectConfigRow,
    | "name"
    | "locale"
    | "prompt_template"
    | "speaking_style"
    | "cultural_notes"
    | "formality_level"
    | "greeting_phrase"
    | "closing_phrase"
  > | null;
  aggressiveness?: AggressivenessMode;
  priority?: PriorityMode;
  maxConcessionRounds?: number;
  voicemailBehavior?: VoicemailBehavior;
  aiDisclosure?: boolean;
  useFloorPrice?: boolean;
  decryptedFloorPrice?: number | null;
}

export interface PromptBuilderOutput {
  systemPrompt: string;
  greeting: string;
  dialectSection: string;
  multilingualInstruction: string;
  formalityInstruction: string;
}

function formatItemLines(items: RFQRow["items"]): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return "No specific items listed";
  }
  return items
    .map((item, i) => {
      const priceStr =
        item.target_unit_price != null
          ? ` @ $${Number(item.target_unit_price).toFixed(2)}/ea`
          : "";
      return `  ${i + 1}. ${item.quantity} ${item.unit} — ${item.description}${priceStr}${item.sku ? ` (SKU: ${item.sku})` : ""}`;
    })
    .join("\n");
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Flexible (no fixed deadline)";
  try {
    return new Date(deadline).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return deadline;
  }
}

function buildSupplierMetadataSection(metadata: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) return "";
  const relevant = ["industry", "size", "years_in_business", "notes", "preferred_terms"];
  const lines: string[] = ["Supplier Metadata:"];
  for (const key of relevant) {
    if (metadata[key] != null) {
      lines.push(`- ${key.replace(/_/g, " ")}: ${metadata[key]}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

function buildCallGoalsSection(
  rfq: PromptBuilderInput["rfq"],
  supplier: PromptBuilderInput["supplier"],
): string {
  const hasDeadline = !!rfq.deadline;
  const hasTargetPrice = rfq.target_price != null;
  const hasItems = Array.isArray(rfq.items) && rfq.items.length > 0;

  const goals: string[] = [];

  goals.push("CALL OBJECTIVES (in priority order):");

  if (hasItems) {
    goals.push("1. Confirm the supplier can provide the listed items at the required quantities");
  }
  if (hasTargetPrice) {
    goals.push(
      `2. Negotiate toward the target price of $${Number(rfq.target_price).toLocaleString()}`,
    );
  }
  goals.push("3. Establish delivery timeline and confirm feasibility");
  goals.push("4. Agree on payment terms");
  goals.push("5. Collect a firm, confirmed quote with all specifics");

  if (hasDeadline) {
    goals.push(
      `6. Ensure delivery can be completed by: ${formatDeadline(rfq.deadline)}`,
    );
  }

  goals.push("");
  goals.push("SUCCESS CRITERIA:");
  goals.push("A successful call = confirmed price + terms + delivery timeline + high confidence score");
  goals.push(
    "A partial success = some information collected, supplier needs internal confirmation",
  );
  goals.push("A failed call = supplier cannot meet requirements or refuses to engage");

  return goals.join("\n");
}

export function buildNegotiationPrompt(
  input: PromptBuilderInput,
): PromptBuilderOutput {
  const aggressiveness = input.aggressiveness || "medium";
  const priority = input.priority || "balanced";
  const maxConcessionRounds =
    input.maxConcessionRounds != null
      ? input.maxConcessionRounds
      : 3;
  const voicemailBehavior = input.voicemailBehavior || "callback";
  const aiDisclosure = input.aiDisclosure ?? true;

  let dialectCtx: DialectContext | null = null;
  let customDialectSection = "";

  if (input.dialectConfig) {
    dialectCtx = getDialectByLocale(input.dialectConfig.locale);
    if (dialectCtx) {
      customDialectSection = buildDialectSection(dialectCtx);
    } else {
      customDialectSection = [
        `=== CULTURAL & DIALECT CONTEXT ===`,
        `Supplier Region: ${input.dialectConfig.name} (${input.dialectConfig.locale})`,
        `Formality Level: ${input.dialectConfig.formality_level}`,
        ``,
        `Communication Style:`,
        input.dialectConfig.speaking_style,
        ``,
        input.dialectConfig.cultural_notes
          ? `Cultural Notes:\n${input.dialectConfig.cultural_notes}`
          : "",
        ``,
        input.dialectConfig.greeting_phrase
          ? `Suggested Opening: "${input.dialectConfig.greeting_phrase}"`
          : "",
        input.dialectConfig.closing_phrase
          ? `Suggested Closing: "${input.dialectConfig.closing_phrase}"`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  } else if (input.supplier.metadata?.region) {
    const region = String(input.supplier.metadata.region);
    dialectCtx = getDialectByLocale(region);
    if (dialectCtx) {
      customDialectSection = buildDialectSection(dialectCtx);
    }
  }

  const config: NegotiationConfig = {
    aggressiveness,
    priority,
    maxConcessionRounds,
    useFloorPrice: input.useFloorPrice ?? false,
    floorPrice: input.decryptedFloorPrice ?? null,
    targetPrice: input.rfq.target_price,
    aiDisclosure,
    voicemailBehavior,
    currency: input.rfq.currency || "USD",
  };

  const baseSystemPrompt = buildSystemPrompt(config);

  const formalityInstruction = input.dialectConfig
    ? buildFormalityInstruction(input.dialectConfig.formality_level as any)
    : "";

  const multilingualInstruction = input.dialectConfig
    ? buildMultilingualInstruction(input.dialectConfig.locale)
    : "";

  const rfqContext = [
    `CURRENT NEGOTIATION:`,
    `- RFQ: ${input.rfq.title}`,
    `- Description: ${input.rfq.description}`,
    `- Items:`,
    formatItemLines(input.rfq.items),
    `- Target Price: ${input.rfq.target_price != null ? `${input.rfq.currency || "USD"}${Number(input.rfq.target_price).toLocaleString()}` : "Best market price"}`,
    `- Deadline: ${formatDeadline(input.rfq.deadline)}`,
  ].join("\n");

  const supplierContext = [
    `SUPPLIER PROFILE:`,
    `- Name: ${input.supplier.name}`,
    `- Contact: ${input.supplier.contact_name || "Available representative"}`,
    `- Phone: ${input.supplier.phone}`,
    input.supplier.email ? `- Email: ${input.supplier.email}` : "",
    buildSupplierMetadataSection(input.supplier.metadata),
  ]
    .filter(Boolean)
    .join("\n");

  const callGoals = buildCallGoalsSection(input.rfq, input.supplier);

  const greeting = input.dialectConfig?.greeting_phrase
    ? input.dialectConfig.greeting_phrase
    : `Hello, this is an AI-powered assistant calling from HAGGL. This call may be recorded for quality purposes. Am I speaking with ${input.supplier.contact_name || "someone from " + input.supplier.name}?`;

  const combinedPrompt = [
    baseSystemPrompt,
    "",
    "---",
    "",
    rfqContext,
    "",
    supplierContext,
    "",
    callGoals,
    "",
    customDialectSection ? `---\n\n${customDialectSection}` : "",
    "",
    formalityInstruction ? `---\n\nFORMALITY:\n${formalityInstruction}` : "",
    "",
    multilingualInstruction
      ? `---\n\n${multilingualInstruction}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: combinedPrompt,
    greeting,
    dialectSection: customDialectSection,
    multilingualInstruction,
    formalityInstruction,
  };
}
