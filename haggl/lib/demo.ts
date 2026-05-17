const DEFAULT_DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export function getDemoOrganizationId(): string {
  return process.env.NEXT_PUBLIC_DEMO_ORG_ID || DEFAULT_DEMO_ORG_ID;
}

export function resolveOrganizationId(
  organizationId?: string | null,
): string | null {
  if (organizationId) return organizationId;
  if (process.env.DEMO_MODE === "true") {
    return getDemoOrganizationId();
  }
  return null;
}
