import z from "zod";

const booleanFromString = z.union([z.boolean(), z.string().transform((s) => s === "true" || s === "1")]).pipe(z.coerce.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  WS_PORT: z.coerce.number().default(3001),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  TWILIO_WEBHOOK_BASE: z.string().url().optional(),
  TWILIO_WEBHOOK_BASE_URL: z.string().url().optional(),
  SERVER_WEBHOOK_BASE: z.string().url().optional(),

  DEEPGRAM_API_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),

  ENCRYPTION_KEY: z.string().length(64),

  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  SERVICE_NAME: z.string().default("haggl"),

  HAGGL_DATA_DIR: z.string().default("./data"),
  REDIS_URL: z.string().url().optional(),

  DEMO_MODE: booleanFromString.default("false"),
  ENABLE_AUTH: booleanFromString.default("true"),
  NEXT_PUBLIC_DEMO_ORG_ID: z.string().uuid().optional(),
  MAX_CONCURRENT_CALLS: z.coerce.number().default(8),
  CALLS_PER_SECOND: z.coerce.number().default(1),
  CALL_TIMEOUT_SECONDS: z.coerce.number().default(480),

  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_WS_URL: z.string().default("http://localhost:3001"),
}).superRefine((env, ctx) => {
  if (!env.TWILIO_WEBHOOK_BASE && !env.TWILIO_WEBHOOK_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TWILIO_WEBHOOK_BASE"],
      message: "TWILIO_WEBHOOK_BASE or TWILIO_WEBHOOK_BASE_URL is required",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let _parsed: Env | null = null;
let _errors: z.ZodError | null = null;

export function validateEnv(): Env {
  if (_parsed) return _parsed;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    _errors = result.error;
    const missing = result.error.errors
      .filter((e) => e.code === "invalid_type" && e.received === "undefined")
      .map((e) => e.path.join("."));
    const invalid = result.error.errors
      .filter((e) => e.code !== "invalid_type" || e.received !== "undefined")
      .map((e) => `${e.path.join(".")}: ${e.message}`);
    console.error("Environment validation failed:");
    if (missing.length) console.error("  Missing:", missing.join(", "));
    if (invalid.length) invalid.forEach((e) => console.error("  Invalid:", e));
    throw new Error(`Environment validation failed: ${missing.length} missing, ${invalid.length} invalid`);
  }
  _parsed = result.data;
  return _parsed;
}

export function getEnv(): Env {
  if (!_parsed) return validateEnv();
  return _parsed;
}

export function getEnvErrors(): z.ZodError | null {
  return _errors;
}

export function resetEnvValidation(): void {
  _parsed = null;
  _errors = null;
}

export const requiredVars: { key: keyof Env; description: string }[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anonymous key (safe for client)" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", description: "Supabase service role key (server-only)" },
  { key: "TWILIO_ACCOUNT_SID", description: "Twilio account SID" },
  { key: "TWILIO_AUTH_TOKEN", description: "Twilio auth token" },
  { key: "TWILIO_PHONE_NUMBER", description: "Twilio outbound phone number" },
  { key: "TWILIO_WEBHOOK_BASE", description: "Public base URL for Twilio webhooks (ngrok/production)" },
  { key: "SERVER_WEBHOOK_BASE", description: "Public base URL for bridge media WebSocket (optional if same host)" },
  { key: "DEEPGRAM_API_KEY", description: "Deepgram API key" },
  { key: "ANTHROPIC_API_KEY", description: "Anthropic API key (Claude)" },
  { key: "ENCRYPTION_KEY", description: "64-char hex AES-256-GCM encryption key" },
];
