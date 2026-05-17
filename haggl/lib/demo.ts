export function getDemoOrganizationId(): string {
  const id = process.env.NEXT_PUBLIC_DEMO_ORG_ID;
  if (!id) throw new Error("NEXT_PUBLIC_DEMO_ORG_ID not set");
  return id;
}

export function resolveOrganizationId(
  organizationId?: string | null,
): string | null {
  return organizationId || null;
}
